// Validate handcrafted levels (the ROOT file that actually ships):
//  • each arrow's cells are contiguous (4-connectivity, no diagonals)
//  • each cell is inside the grid
//  • no two arrows share a cell (heads or bodies)
//  • level is solvable (topological unwinding succeeds)
//  • shape keys (≥25): arrow len ≥ 2, d matches the last cell segment,
//    known `t` shape id, initial openness within the tier's hard cap
//  • key coverage is exactly {1..20} ∪ {25,30,…,2225}
//  • file stays under 4.5 MB

const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const HC_PATH = path.join(ROOT, 'handcrafted-levels.js');
const HANDCRAFTED = require(HC_PATH);
const { SHAPE_NAMES } = require('./shape-masks.js');
const DX = [1, 0, -1, 0];   // 0=right 1=up 2=left 3=down → DX[d] is column delta
const DY = [0, -1, 0, 1];   // DY[d] is row delta

// Hard openness caps by tier (band targets are tighter; the caps catch
// regressions while tolerating the documented off-band tail — see
// tools/out/shape-manifest.json).
function openCap(lvl) { return lvl < 500 ? 8 : lvl < 1200 ? 12 : 16; }
function dirOfSegment(a, b) {
  const dr = b[0] - a[0], dc = b[1] - a[1];
  if (dr === 0 && dc === 1) return 0;
  if (dr === -1 && dc === 0) return 1;
  if (dr === 0 && dc === -1) return 2;
  if (dr === 1 && dc === 0) return 3;
  return -1;
}

function validateGeometry(level) {
  const errs = [];
  const occ = {};
  for (let i = 0; i < level.arrows.length; i++) {
    const a = level.arrows[i];
    if (!a.c || a.c.length === 0) {
      errs.push(`arrow ${i}: empty cells`); continue;
    }
    if (a.d === undefined || a.d < 0 || a.d > 3) {
      errs.push(`arrow ${i}: invalid dir ${a.d}`); continue;
    }
    for (let j = 0; j < a.c.length; j++) {
      const [r, c] = a.c[j];
      if (r < 0 || r >= level.rows || c < 0 || c >= level.cols) {
        errs.push(`arrow ${i} cell ${j} (${r},${c}) out of grid ${level.rows}×${level.cols}`);
      }
      const k = r + ',' + c;
      if (occ[k] !== undefined) {
        errs.push(`arrow ${i} cell (${r},${c}) overlaps with arrow ${occ[k]}`);
      }
      occ[k] = i;
      if (j > 0) {
        const [pr, pc] = a.c[j-1];
        const dist = Math.abs(r - pr) + Math.abs(c - pc);
        if (dist !== 1) {
          errs.push(`arrow ${i} cells ${j-1}→${j} not adjacent: (${pr},${pc})→(${r},${c})`);
        }
      }
    }
  }
  return errs;
}

function isSolvable(level) {
  const arrs = level.arrows.map(a => ({ ...a, alive: true }));
  let removed = 0; const total = arrs.length;
  while (removed < total) {
    let progressed = false;
    for (const a of arrs) {
      if (!a.alive) continue;
      const head = a.c[a.c.length - 1];
      let cr = head[0] + DY[a.d], cc = head[1] + DX[a.d];
      let clear = true;
      while (cr >= 0 && cr < level.rows && cc >= 0 && cc < level.cols && clear) {
        for (const o of arrs) {
          if (o === a || !o.alive) continue;
          for (const [or, oc] of o.c) {
            if (or === cr && oc === cc) { clear = false; break; }
          }
          if (!clear) break;
        }
        cr += DY[a.d]; cc += DX[a.d];
      }
      if (clear) { a.alive = false; removed++; progressed = true; break; }
    }
    if (!progressed) return { solvable: false, stuck: arrs.filter(a => a.alive).length };
  }
  return { solvable: true };
}

function initialOpenness(level) {
  const arrs = level.arrows.map(a => ({ ...a, alive: true }));
  let open = 0;
  for (const a of arrs) {
    const head = a.c[a.c.length - 1];
    let cr = head[0] + DY[a.d], cc = head[1] + DX[a.d];
    let clear = true;
    while (cr >= 0 && cr < level.rows && cc >= 0 && cc < level.cols && clear) {
      for (const o of arrs) {
        if (o === a) continue;
        for (const [or, oc] of o.c) {
          if (or === cr && oc === cc) { clear = false; break; }
        }
        if (!clear) break;
      }
      cr += DY[a.d]; cc += DX[a.d];
    }
    if (clear) open++;
  }
  return open;
}

// ── Key coverage ─────────────────────────────────────────────────────
// v2.0.1: dense shape block 21..300, then every 5th to 2225.
const expected = new Set();
for (let i = 1; i <= 300; i++) expected.add(i);
for (let l = 305; l <= 2225; l += 5) expected.add(l);
const actual = new Set(Object.keys(HANDCRAFTED).map(Number));
let ok = true;
for (const k of expected) if (!actual.has(k)) { console.log(`✗ missing key ${k}`); ok = false; }
for (const k of actual) if (!expected.has(k)) { console.log(`✗ unexpected key ${k}`); ok = false; }

// ── File size gate ───────────────────────────────────────────────────
const bytes = fs.statSync(HC_PATH).size;
if (bytes > 4.5 * 1024 * 1024) { console.log(`✗ file is ${(bytes / 1048576).toFixed(2)} MB (max 4.5)`); ok = false; }

// ── Per-level checks ─────────────────────────────────────────────────
let checked = 0, shapeCount = 0;
const warns = 0;
for (const lvlKey in HANDCRAFTED) {
  const lvl = Number(lvlKey);
  const level = HANDCRAFTED[lvlKey];
  const errs = validateGeometry(level);
  const solv = isSolvable(level);
  const open = initialOpenness(level);
  const arrows = level.arrows.length;
  if (!solv.solvable) errs.push(`NOT SOLVABLE — ${solv.stuck} arrows stuck`);

  if (lvl >= 21) { // generated shape levels: stricter contract
    shapeCount++;
    if (!level.t) errs.push('missing shape id `t`');
    else if (!SHAPE_NAMES.includes(level.t) && !/^[0-9]+$/.test(level.t)) errs.push(`unknown shape id ${level.t}`);
    for (let i = 0; i < level.arrows.length; i++) {
      const a = level.arrows[i];
      if (a.c.length < 2) { errs.push(`arrow ${i}: len ${a.c.length} < 2`); continue; }
      const seg = dirOfSegment(a.c[a.c.length - 2], a.c[a.c.length - 1]);
      if (seg !== a.d) errs.push(`arrow ${i}: d=${a.d} but last segment points ${seg}`);
    }
    if (open > openCap(lvl)) errs.push(`initially open=${open} exceeds hard cap ${openCap(lvl)}`);
  }

  if (errs.length) {
    console.log(`✗ lvl ${lvl}: ${arrows} arrows, ${level.rows}×${level.cols}`);
    errs.forEach(e => console.log(`   ${e}`));
    ok = false;
  }
  checked++;
}

console.log(`${ok ? '✓' : '✗'} ${checked} levels checked (${shapeCount} shape), file ${(bytes / 1048576).toFixed(2)} MB${warns ? `, ${warns} warnings` : ''}`);
process.exit(ok ? 0 : 1);
