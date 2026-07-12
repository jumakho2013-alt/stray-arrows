#!/usr/bin/env node
// Tiny terminal playtest harness for the handcrafted/shape levels.
// Renders boards to ANSI, auto-solves via the greedy walker, reports
// whether a level looks fair: arrow count, initially-tappable count,
// solvability, dependency waves.
//
// Usage:
//   node tools/playtest-cli.js sweep            # metrics table over ALL levels
//   node tools/playtest-cli.js handcrafted 50   # render one level
//   node tools/playtest-cli.js shapes heart     # render every heart instance
//   node tools/playtest-cli.js random 10        # N random levels, rendered
//
// Goal: catch boards that pass _isLevelSolvable but FEEL bad — e.g. only
// one arrow ever tappable, or solution forces a tedious linear path.
// We don't reject anything here; this prints summaries that you eyeball.

const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const HANDCRAFTED = require(path.join(ROOT, 'handcrafted-levels.js'));

const DX = [1, 0, -1, 0];
const DY = [0, -1, 0, 1];
const DIR_CHAR = ['→', '↑', '←', '↓'];

// Dependency metrics — same math as tools/gen-shape-levels.js bands.
function metricsOf(level) {
  const { rows: R, cols: C, arrows: A } = level;
  const occ = new Map();
  A.forEach((a, i) => a.c.forEach(([r, c]) => occ.set(r * C + c, i)));
  const deps = A.map((a, i) => {
    const s = new Set();
    let [hr, hc] = a.c[a.c.length - 1];
    const dr = DY[a.d], dc = DX[a.d];
    let r = hr + dr, c = hc + dc;
    while (r >= 0 && r < R && c >= 0 && c < C) {
      const j = occ.get(r * C + c);
      if (j !== undefined && j !== i) s.add(j);
      r += dr; c += dc;
    }
    return s;
  });
  const rem = new Set(A.map((_, i) => i));
  let waves = 0, open = 0;
  while (rem.size) {
    const ready = [...rem].filter(i => [...deps[i]].every(b => !rem.has(b)));
    if (!ready.length) return null;
    if (waves === 0) open = ready.length;
    waves++;
    ready.forEach(i => rem.delete(i));
  }
  const avgB = deps.reduce((s, d) => s + d.size, 0) / A.length;
  return { open, waves, avgB };
}

function renderBoard(level) {
  const { rows, cols, arrows } = level;
  const grid = [];
  for (let r = 0; r < rows; r++) grid.push(new Array(cols).fill('·'));
  arrows.forEach((a, i) => {
    a.c.forEach(([r, c], j) => {
      const isHead = j === a.c.length - 1;
      grid[r][c] = isHead ? DIR_CHAR[a.d] : String.fromCharCode(65 + (i % 26));
    });
  });
  return grid.map(row => row.join(' ')).join('\n');
}

function isSolvable(level) {
  const arrs = level.arrows.map(a => ({ ...a, alive: true }));
  const path = [];
  let removed = 0;
  while (removed < arrs.length) {
    let progress = false;
    for (let i = 0; i < arrs.length; i++) {
      const a = arrs[i];
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
      if (clear) { a.alive = false; removed++; progress = true; path.push(i); break; }
    }
    if (!progress) return { solvable: false, path };
  }
  return { solvable: true, path };
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

function summarize(level, lvlNum) {
  const open = initialOpenness(level);
  const solv = isSolvable(level);
  const arrowCount = level.arrows.length;
  const cellCount = level.arrows.reduce((s, a) => s + a.c.length, 0);
  const density = (cellCount / (level.rows * level.cols) * 100).toFixed(1);
  console.log(`\n── Level ${lvlNum} ${'─'.repeat(40)}`);
  console.log(renderBoard(level));
  console.log(`grid ${level.rows}×${level.cols}, arrows ${arrowCount}, cells ${cellCount} (${density}% dense)`);
  console.log(`initial open: ${open}, solvable: ${solv.solvable ? 'yes' : 'NO'}`);
  if (solv.solvable) console.log(`solution: ${solv.path.map(i => String.fromCharCode(65 + (i % 26))).join(' → ')}`);
  // Heuristic flags
  const flags = [];
  if (open === 0 && solv.solvable) flags.push('opening trap (greedy fired but 0 visibly open)');
  if (open > arrowCount * 0.7) flags.push('too open — most arrows tappable from start');
  if (arrowCount < 4) flags.push('very few arrows — too easy?');
  if (density < 25) flags.push('sparse — empty space dominates');
  if (flags.length) console.log(`⚠ ${flags.join('; ')}`);
}

function main() {
  const args = process.argv.slice(2);
  const handcrafted = HANDCRAFTED;
  const keys = Object.keys(handcrafted).map(Number).sort((a, b) => a - b);

  if (args[0] === 'handcrafted' && args[1]) {
    const lvl = handcrafted[args[1]];
    if (!lvl) { console.error(`no handcrafted level ${args[1]}`); process.exit(1); }
    summarize(lvl, args[1]);
    return;
  }
  if (args[0] === 'shapes' && args[1]) {
    const hits = keys.filter(k => handcrafted[k].t === args[1]);
    if (!hits.length) { console.error(`no levels with shape ${args[1]}`); process.exit(1); }
    for (const k of hits) summarize(handcrafted[k], k);
    return;
  }
  if (args[0] === 'sweep') {
    // one line per level; flags at the end
    let bad = 0;
    for (const k of keys) {
      const lvl = handcrafted[k];
      const m = metricsOf(lvl);
      const solvable = !!m;
      const flags = [];
      if (!solvable) { flags.push('NOT SOLVABLE'); bad++; }
      else {
        if (m.open > lvl.arrows.length * 0.7) flags.push('too open');
        if (m.waves < 2 && k > 10) flags.push('shallow');
      }
      console.log(`${String(k).padStart(5)} ${String(lvl.t || '-').padEnd(10)} ${String(lvl.arrows.length).padStart(3)}a ${solvable ? 'open=' + String(m.open).padStart(2) + ' waves=' + String(m.waves).padStart(2) + ' avgB=' + m.avgB.toFixed(1) : ''} ${flags.join('; ')}`);
    }
    console.log(bad ? `\n${bad} level(s) FAILED` : `\nAll ${keys.length} levels solvable`);
    process.exit(bad ? 1 : 0);
  }
  // default / random N: render a random sample
  const count = parseInt(args[0] === 'random' ? args[1] : args[0], 10) || 10;
  const picked = [];
  for (let i = 0; i < count; i++) picked.push(keys[Math.floor(Math.random() * keys.length)]);
  for (const k of picked) summarize(handcrafted[k], k);
}

main();
