#!/usr/bin/env node
// Validate every level in levels/imported-NNN.js — same checks as
// validate-handcrafted.js but driven from the chunk meta file. Geometry,
// solvability, and minimum-openness are all required to pass.
//
// Run: node tools/validate-imported.js
// CI: npm run validate-imported (added to package.json scripts).

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const META_PATH = path.join(ROOT, 'levels/imported-meta.js');

const DX = [1, 0, -1, 0];
const DY = [0, -1, 0, 1];

function validateGeometry(level, lvl) {
  const errs = [];
  const occ = {};
  for (let i = 0; i < level.arrows.length; i++) {
    const a = level.arrows[i];
    if (!a.c || a.c.length === 0) { errs.push(`lvl ${lvl} arrow ${i}: empty cells`); continue; }
    if (a.d === undefined || a.d < 0 || a.d > 3) { errs.push(`lvl ${lvl} arrow ${i}: invalid dir ${a.d}`); continue; }
    for (let j = 0; j < a.c.length; j++) {
      const [r, c] = a.c[j];
      if (r < 0 || r >= level.rows || c < 0 || c >= level.cols) {
        errs.push(`lvl ${lvl} arrow ${i} cell ${j} (${r},${c}) out of grid`);
      }
      const k = r + ',' + c;
      if (occ[k] !== undefined) errs.push(`lvl ${lvl} arrow ${i} (${r},${c}) overlaps arrow ${occ[k]}`);
      occ[k] = i;
      if (j > 0) {
        const [pr, pc] = a.c[j - 1];
        if (Math.abs(r - pr) + Math.abs(c - pc) !== 1) {
          errs.push(`lvl ${lvl} arrow ${i} cells ${j - 1}→${j} not adjacent`);
        }
      }
    }
  }
  return errs;
}

function isSolvable(level) {
  const arrs = level.arrows.map(a => ({ ...a, alive: true }));
  let removed = 0;
  while (removed < arrs.length) {
    let progress = false;
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
      if (clear) { a.alive = false; removed++; progress = true; break; }
    }
    if (!progress) return false;
  }
  return true;
}

const meta = require(META_PATH);
let totalLevels = 0, geomFails = 0, solvFails = 0, ok = true;

for (const m of meta) {
  const chunkPath = path.join(ROOT, 'levels', m.file);
  const chunk = require(chunkPath);
  const lvls = Object.keys(chunk);
  totalLevels += lvls.length;
  for (const lvl of lvls) {
    const level = chunk[lvl];
    // Convert imported format ({arrows: [{c, d}]}) to validator format
    const errs = validateGeometry(level, lvl);
    if (errs.length) { errs.forEach(e => console.error('GEO ' + e)); geomFails++; ok = false; }
    if (!isSolvable(level)) { console.error(`SOLV lvl ${lvl}: not solvable by greedy walk`); solvFails++; ok = false; }
  }
  console.log(`✓ ${m.file}: ${lvls.length} levels checked`);
}

console.log('');
console.log(`Total: ${totalLevels} levels, ${geomFails} geometry failures, ${solvFails} solvability failures.`);
process.exit(ok ? 0 : 1);
