#!/usr/bin/env node
// Import puzzles from fogleman/rush — Rush Hour database — into Stray Arrows
// level format. The database (https://www.michaelfogleman.com/rush/) lists
// 2.5M solved Rush Hour boards as `<moves> <board> <cluster_size>` lines.
//
// We can't keep Rush Hour mechanics 1:1 — Rush Hour cars slide back and forth,
// our arrows fly out of the grid in a single direction and disappear. But the
// LAYOUT translates well: each car becomes a multi-cell arrow with a chosen
// escape direction. Boards that fail our greedy solvability check are dropped.
//
// Output: 13 chunked level files in levels/imported-NNN.js, each defining
// window.IMPORTED_LEVELS_CHUNK_K and exporting via CommonJS for Node tooling.
// A meta file levels/imported-meta.js lists chunk ranges so the runtime
// loader knows which chunk to fetch for a given level number.
//
// Run: node tools/import-rushhour.js
// Requires: tools/data/rush.txt (gunzip from rush.txt.gz, gitignored).

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'tools/data/rush.txt');
const OUT_DIR = path.join(ROOT, 'levels');

// Match the runtime constants in index.html so the solvability check is
// guaranteed to agree with what the player sees.
//   d=0 RIGHT, d=1 UP, d=2 LEFT, d=3 DOWN
const DX = [1, 0, -1, 0];
const DY = [0, -1, 0, 1];

// ---------- Stratification spec ----------
// The Rush Hour `moves` value is the optimal solution length. Our gameplay is
// strictly easier (no backtracking), so the same `moves` value maps to a lower
// difficulty in our game. The buckets below are the empirical mapping that
// places a healthy ramp-up: gentle filler in the early hundreds, real bite
// past 300, late-game grinders past 600. If playtest shows a bucket too easy
// or too hard, adjust the {minMoves, maxMoves} only and re-run.
//
// `targetCount` is what we want; we'll over-sample when the dataset has more
// than enough so we can throw away post-conversion failures without dropping
// below the target.
// "Levels everywhere" pass — push the import to ~5-6k boards so the
// procedural generator + BAKED levels can effectively retire. Buckets
// stretch level numbers all the way to 6000; difficulty ramps through
// stratified sampling (each bucket sorts ascending by Rush Hour `moves`
// before being spread across its range, so the easier boards land first).
//
// We deliberately oversize the targets so the streaming reader keeps
// going past 100k lines and harvests all the moderate-difficulty boards
// the database can provide, not just the first 6k it stumbles on.
const BUCKETS = [
  { range: [11, 1000],    minMoves: 5,  maxMoves: 13, targetCount: 2500 },
  { range: [1001, 2500],  minMoves: 13, maxMoves: 22, targetCount: 3000 },
  { range: [2501, 4500],  minMoves: 22, maxMoves: 34, targetCount: 2500 },
  { range: [4501, 6000],  minMoves: 34, maxMoves: 99, targetCount: 1500 },
];
const CHUNK_SIZE = 250;

// ---------- Parsers ----------

// Rush Hour board: 36 chars, row-major, 6×6.
//   o = empty   x = wall (some entries place blockers in the entrance row)
//   A-Z = car id, A is conventionally the red car (target)
function parseRushBoard(str) {
  if (str.length !== 36) return null;
  const grid = [];
  for (let r = 0; r < 6; r++) {
    grid.push(str.slice(r * 6, (r + 1) * 6).split(''));
  }
  return grid;
}

// Group same-letter cells into cars. Each car is contiguous and linear (1xN
// or Nx1) — Rush Hour guarantees this. We still verify because malformed
// rows in a 2.5M-line file would silently produce broken levels otherwise.
function extractCars(grid) {
  const cars = {};
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 6; c++) {
      const ch = grid[r][c];
      if (ch === 'o' || ch === 'x') continue;
      if (!cars[ch]) cars[ch] = [];
      cars[ch].push([r, c]);
    }
  }
  const result = [];
  for (const [id, cells] of Object.entries(cars)) {
    if (cells.length < 2) return null; // single-cell "car" — skip whole board
    const rows = new Set(cells.map(c => c[0]));
    const cols = new Set(cells.map(c => c[1]));
    let orient;
    if (rows.size === 1) orient = 'H';
    else if (cols.size === 1) orient = 'V';
    else return null; // L-shape — not a Rush Hour car, skip board
    // Sort tail→head: H = left-to-right, V = top-to-bottom
    cells.sort(orient === 'H' ? (a, b) => a[1] - b[1] : (a, b) => a[0] - b[0]);
    result.push({ id, cells, orient });
  }
  return result;
}

// Pick an escape direction for a car. The red car (A) always exits right —
// that's the canonical Rush Hour goal. For other cars we pick the side with
// MORE clear cells beyond the head/tail in the initial board: that side has
// the best chance of being reachable when the player starts unwinding the
// puzzle. If both sides are equally blocked, fall back to a default
// (H→RIGHT, V→DOWN) — boards where this gets you stuck will be filtered
// out by the solvability check downstream.
function chooseDir(car, grid) {
  if (car.id === 'A') return 0; // red car: classic exit right
  const [r0, c0] = car.cells[0];                                  // tail
  const [r1, c1] = car.cells[car.cells.length - 1];               // head
  if (car.orient === 'H') {
    let leftFree = 0, rightFree = 0;
    for (let c = c0 - 1; c >= 0 && grid[r0][c] === 'o'; c--) leftFree++;
    for (let c = c1 + 1; c < 6 && grid[r1][c] === 'o'; c++) rightFree++;
    if (rightFree > leftFree) return 0;
    if (leftFree > rightFree) return 2;
    return 0; // tie → RIGHT
  } else {
    let upFree = 0, downFree = 0;
    for (let r = r0 - 1; r >= 0 && grid[r][c0] === 'o'; r--) upFree++;
    for (let r = r1 + 1; r < 6 && grid[r][c1] === 'o'; r++) downFree++;
    if (downFree > upFree) return 3;
    if (upFree > downFree) return 1;
    return 3; // tie → DOWN
  }
}

// If d=2 (LEFT) or d=1 (UP), the head should be the END that exits — i.e. the
// LEFTMOST or TOPMOST cell. Our format expects head = last cell in `c`. For
// the "natural" directions (RIGHT for H, DOWN for V) the natural sort order
// is already correct; for the reverse directions we flip the cells array.
function orientCells(car, dir) {
  const cells = car.cells.map(([r, c]) => [r, c]);
  const naturalDir = car.orient === 'H' ? 0 : 3;
  if (dir === naturalDir) return cells;
  // dir is LEFT (for H) or UP (for V): reverse so tail→head matches escape
  if ((car.orient === 'H' && dir === 2) || (car.orient === 'V' && dir === 1)) {
    cells.reverse();
    return cells;
  }
  return cells; // shouldn't happen: chooseDir only returns 0/2 for H or 1/3 for V
}

// Same greedy walker as `_isLevelSolvable` in index.html (lines 2200-2227).
// Copy is intentional — keeping the import tool free of HTML parsing means
// it can run in pure Node, and the algorithm is short enough that drift
// risk is acceptable. If you change one, change both.
function isSolvable(arrows, rows, cols) {
  const N = arrows.length;
  const alive = new Array(N).fill(true);
  let removed = 0;
  while (removed < N) {
    let progress = false;
    for (let i = 0; i < N; i++) {
      if (!alive[i]) continue;
      const cells = arrows[i].cells;
      const head = cells[cells.length - 1];
      const dir = arrows[i].dir;
      let cr = head[0] + DY[dir];
      let cc = head[1] + DX[dir];
      let clear = true;
      while (cr >= 0 && cr < rows && cc >= 0 && cc < cols && clear) {
        for (let j = 0; j < N; j++) {
          if (j === i || !alive[j]) continue;
          for (const [or, oc] of arrows[j].cells) {
            if (or === cr && oc === cc) { clear = false; break; }
          }
          if (!clear) break;
        }
        cr += DY[dir];
        cc += DX[dir];
      }
      if (clear) { alive[i] = false; removed++; progress = true; break; }
    }
    if (!progress) return false;
  }
  return true;
}

// ---------- Streaming pass ----------

async function streamAndBucket() {
  const buckets = BUCKETS.map(b => ({ ...b, candidates: [] }));
  const seenHash = new Set();

  let lineNum = 0;
  let totalAccepted = 0;
  let droppedUnsolvable = 0;
  let droppedDup = 0;
  let droppedParse = 0;

  const reader = readline.createInterface({
    input: fs.createReadStream(SRC),
    crlfDelay: Infinity,
  });

  for await (const line of reader) {
    lineNum++;
    if (!line) continue;
    const parts = line.split(' ');
    if (parts.length < 2) { droppedParse++; continue; }
    const moves = parseInt(parts[0], 10);
    const boardStr = parts[1];
    if (!Number.isFinite(moves) || boardStr.length !== 36) { droppedParse++; continue; }

    // Quick reject: skip if no bucket wants this difficulty AND has room
    let target = null;
    for (const b of buckets) {
      if (moves >= b.minMoves && moves <= b.maxMoves &&
          b.candidates.length < b.targetCount * 3) {
        target = b; break;
      }
    }
    if (!target) continue;

    // Dedupe by raw board string — exact same configuration.
    if (seenHash.has(boardStr)) { droppedDup++; continue; }

    const grid = parseRushBoard(boardStr);
    if (!grid) { droppedParse++; continue; }
    const cars = extractCars(grid);
    if (!cars) { droppedParse++; continue; }

    const arrows = cars.map(car => {
      const dir = chooseDir(car, grid);
      return { c: orientCells(car, dir), d: dir };
    }).map(a => ({ cells: a.c, dir: a.d, _out: { c: a.c, d: a.d } }));

    if (!isSolvable(arrows, 6, 6)) { droppedUnsolvable++; continue; }

    seenHash.add(boardStr);
    target.candidates.push({
      moves,
      level: { cols: 6, rows: 6, arrows: arrows.map(a => a._out) },
    });
    totalAccepted++;

    // Print progress every 250k lines
    if (lineNum % 250000 === 0) {
      const fills = buckets.map(b => `${b.range[0]}-${b.range[1]}:${b.candidates.length}/${b.targetCount * 3}`).join(' ');
      process.stdout.write(`  scanned ${lineNum.toLocaleString()} — ${fills}\n`);
    }
    // No early exit. Some buckets (esp. high-moves) never fill to 3× target
    // because the database simply doesn't have that much hard content; we
    // want to scan the whole 2.5M to make sure we got every late-game
    // candidate, not just the first 100k.
  }

  console.log('');
  console.log(`Stream done. Lines scanned: ${lineNum.toLocaleString()}.`);
  console.log(`  accepted (raw): ${totalAccepted}`);
  console.log(`  dropped unsolvable: ${droppedUnsolvable}`);
  console.log(`  dropped duplicate: ${droppedDup}`);
  console.log(`  dropped parse error: ${droppedParse}`);
  return buckets;
}

// ---------- Sampling + emission ----------

// Deterministic seeded PRNG so re-running produces the same output (good for
// CI version-sync checks).
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6D2B79F5) | 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWithinBucket(bucket) {
  const rng = mulberry32(0xA5A5A5 ^ bucket.range[0]);
  // Sort by ascending moves so even sampling spreads difficulty smoothly
  // across the level range.
  const sorted = bucket.candidates.slice().sort((a, b) => a.moves - b.moves);
  const need = Math.min(bucket.targetCount, sorted.length);
  const picked = [];
  if (need === sorted.length) return sorted;
  // Stratified sampling: divide sorted list into `need` slots, pick one
  // from each slot uniformly at random — guarantees every difficulty band
  // in the bucket is represented even if we skip many candidates.
  const slotSize = sorted.length / need;
  for (let i = 0; i < need; i++) {
    const lo = Math.floor(i * slotSize);
    const hi = Math.floor((i + 1) * slotSize);
    const idx = lo + Math.floor(rng() * Math.max(1, hi - lo));
    picked.push(sorted[Math.min(idx, sorted.length - 1)]);
  }
  return picked;
}

function assignLevels(buckets) {
  // Assign sequential level numbers from each bucket's range. We may have
  // FEWER picks than the range size; in that case we leave gaps — the
  // runtime fallback chain (BAKED → procedural) covers the missing levels.
  const byLevel = new Map();
  for (const b of buckets) {
    const picks = pickWithinBucket(b);
    const [start, end] = b.range;
    const slots = end - start + 1;
    if (picks.length === 0) continue;
    // Spread picks evenly across the range
    for (let i = 0; i < picks.length; i++) {
      const lvl = start + Math.floor(i * (slots / picks.length));
      if (lvl > end) break;
      if (!byLevel.has(lvl)) byLevel.set(lvl, picks[i].level);
    }
    console.log(`  bucket ${start}-${end}: placed ${picks.length} of ${b.candidates.length} candidates`);
  }
  return byLevel;
}

function writeChunks(byLevel) {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  // Group levels into fixed-size chunks based on level number
  const chunks = new Map();
  for (const [lvl, level] of byLevel.entries()) {
    const chunkIdx = Math.floor((lvl - 1) / CHUNK_SIZE);
    if (!chunks.has(chunkIdx)) chunks.set(chunkIdx, {});
    chunks.get(chunkIdx)[lvl] = level;
  }
  const meta = [];
  for (const [chunkIdx, levels] of [...chunks.entries()].sort((a, b) => a[0] - b[0])) {
    const start = chunkIdx * CHUNK_SIZE + 1;
    const end = start + CHUNK_SIZE - 1;
    const fname = `imported-${String(chunkIdx).padStart(3, '0')}.js`;
    const fpath = path.join(OUT_DIR, fname);
    const lvlEntries = Object.entries(levels)
      .sort((a, b) => +a[0] - +b[0])
      .map(([lvl, lev]) => `  ${lvl}: ${JSON.stringify(lev)}`)
      .join(',\n');
    const body =
      `// Auto-generated by tools/import-rushhour.js — do NOT edit by hand.\n` +
      `// Imported Rush Hour boards converted to Stray Arrows format.\n` +
      `// Chunk covers levels ${start}..${end}; not every level is present\n` +
      `// (gaps fall through to BAKED_LEVELS / procedural in generateLevel).\n` +
      `(function(){\n` +
      `  const chunk = {\n${lvlEntries}\n  };\n` +
      `  if (typeof window !== 'undefined') {\n` +
      `    window.IMPORTED_LEVELS = window.IMPORTED_LEVELS || {};\n` +
      `    Object.assign(window.IMPORTED_LEVELS, chunk);\n` +
      `    window.IMPORTED_LEVELS_CHUNK_${chunkIdx} = true;\n` +
      `  }\n` +
      `  if (typeof module !== 'undefined' && module.exports) module.exports = chunk;\n` +
      `})();\n`;
    fs.writeFileSync(fpath, body);
    const size = fs.statSync(fpath).size;
    meta.push({ chunkIdx, file: fname, levelStart: start, levelEnd: end, count: Object.keys(levels).length, sizeBytes: size });
    console.log(`  wrote ${fname}: ${Object.keys(levels).length} levels, ${(size / 1024).toFixed(1)} KB`);
  }
  // Meta file used by the runtime loader to map a level number to its chunk.
  const metaBody =
    `// Auto-generated by tools/import-rushhour.js — do NOT edit by hand.\n` +
    `// List of imported-NNN.js chunks and which level numbers they cover.\n` +
    `// The runtime loader (in index.html) consults this to lazily fetch only\n` +
    `// the chunk needed for the player's current level.\n` +
    `(function(){\n` +
    `  const meta = ${JSON.stringify(meta, null, 2)};\n` +
    `  if (typeof window !== 'undefined') window.IMPORTED_LEVELS_META = meta;\n` +
    `  if (typeof module !== 'undefined' && module.exports) module.exports = meta;\n` +
    `})();\n`;
  fs.writeFileSync(path.join(OUT_DIR, 'imported-meta.js'), metaBody);
  console.log(`  wrote imported-meta.js`);
  return meta;
}

// ---------- Main ----------

async function main() {
  console.log('Stray Arrows — Rush Hour level import');
  console.log(`  source: ${SRC}`);
  if (!fs.existsSync(SRC)) {
    console.error(`  ERROR: ${SRC} not found. Run:`);
    console.error(`    curl -L -o tools/data/rush.txt.gz https://www.michaelfogleman.com/static/rush/rush.txt.gz`);
    console.error(`    gunzip -k tools/data/rush.txt.gz`);
    process.exit(1);
  }
  console.log('Streaming database…');
  const buckets = await streamAndBucket();
  console.log('');
  console.log('Sampling within buckets and assigning level numbers…');
  const byLevel = assignLevels(buckets);
  console.log(`  total levels assigned: ${byLevel.size}`);
  console.log('');
  console.log('Writing chunks…');
  const meta = writeChunks(byLevel);
  console.log('');
  console.log(`Done. ${meta.length} chunks, ${byLevel.size} levels.`);
}

main().catch(e => { console.error(e); process.exit(1); });
