#!/usr/bin/env node
// Tiny terminal playtest harness for handcrafted + imported levels.
// Render the board to ANSI, accept move input (or auto-solve via the
// greedy walker), report whether the level looks fair: arrow count,
// initially-tappable count, solvability, optimal solution length.
//
// Usage:
//   node tools/playtest-cli.js                       # 10 random imported levels
//   node tools/playtest-cli.js handcrafted 50        # show level 50 (handcrafted)
//   node tools/playtest-cli.js imported 350          # show imported level 350
//   node tools/playtest-cli.js random imported 5     # 5 random imported
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

function loadImported() {
  // imported-meta.js sets window.IMPORTED_LEVELS_META — but in a Node
  // require it returns the meta array directly via module.exports.
  const meta = require(path.join(ROOT, 'levels/imported-meta.js'));
  const all = {};
  for (const m of meta) {
    const chunk = require(path.join(ROOT, 'levels', m.file));
    Object.assign(all, chunk);
  }
  return all;
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
  const imported = loadImported();
  const handcrafted = HANDCRAFTED;

  if (args[0] === 'handcrafted' && args[1]) {
    const lvl = handcrafted[args[1]];
    if (!lvl) { console.error(`no handcrafted level ${args[1]}`); process.exit(1); }
    summarize(lvl, args[1]);
    return;
  }
  if (args[0] === 'imported' && args[1]) {
    const lvl = imported[args[1]];
    if (!lvl) { console.error(`no imported level ${args[1]}`); process.exit(1); }
    summarize(lvl, args[1]);
    return;
  }
  // default: 10 random imported levels — quick spread sample
  const source = (args[0] === 'random' && args[1] === 'handcrafted') ? handcrafted :
                 (args[0] === 'random' && args[1] === 'imported') ? imported : imported;
  const count = parseInt(args[2] || (args[0] === 'random' ? args[1] : '10'), 10) || 10;
  const keys = Object.keys(source).map(Number).sort((a, b) => a - b);
  const picked = [];
  for (let i = 0; i < count; i++) picked.push(keys[Math.floor(Math.random() * keys.length)]);
  for (const k of picked) summarize(source[k], k);
}

main();
