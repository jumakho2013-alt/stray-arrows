#!/usr/bin/env node
// Rewrites handcrafted-levels.js from the shape-generator output:
//   • keys 1–20 (tutorial + curated early levels) are carried over
//     from the CURRENT handcrafted-levels.js untouched
//   • keys 25..2225 step 5 are replaced with tools/out/shape-levels.json
//     (each carries a `t` shape-id used by the in-game silhouette reveal)
//   • same module shape: `const HANDCRAFTED_LEVELS = {...}` + CommonJS +
//     window export, one level per line
//   • hard size gate: output must stay under 4.5 MB
//
// Run AFTER tools/gen-shape-levels.js. Then bump the `?v=` cache-buster
// on the <script src="handcrafted-levels.js"> tag in index.html.

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const EXISTING = path.join(ROOT, 'handcrafted-levels.js');
const SHAPES = path.join(__dirname, 'out', 'shape-levels.json');
const OUT = EXISTING; // rewritten in place (git is the safety net)
const MAX_BYTES = 4.5 * 1024 * 1024;

const existing = require(EXISTING);
const shapes = JSON.parse(fs.readFileSync(SHAPES, 'utf8'));

// Expected key coverage
const KEEP = [];
for (let i = 1; i <= 20; i++) KEEP.push(i);
const SLOTS = [];
for (let l = 25; l <= 2225; l += 5) SLOTS.push(l);

for (const k of KEEP) {
  if (!existing[k]) { console.error(`existing file is missing key ${k}`); process.exit(1); }
}
for (const l of SLOTS) {
  if (!shapes[l]) { console.error(`shape output is missing level ${l}`); process.exit(1); }
}

const serializeLevel = (lvl) => {
  // compact: {cols:..,rows:..,t:'heart',arrows:[{c:[[r,c],..],d:0},..]}
  const parts = [`cols:${lvl.cols}`, `rows:${lvl.rows}`];
  if (lvl.t) parts.push(`t:${JSON.stringify(lvl.t)}`);
  const arrows = lvl.arrows.map((a) => `{c:${JSON.stringify(a.c)},d:${a.d}}`).join(',');
  parts.push(`arrows:[${arrows}]`);
  return `{${parts.join(',')}}`;
};

const lines = [];
lines.push('// Handcrafted levels — tutorial/curated 1-20 plus GENERATED SHAPE LEVELS');
lines.push('// at every 5th milestone (25..2225): hearts, stars, animals, objects, and');
lines.push('// digit numbers at 50/100/…/2200. Regenerate with:');
lines.push('//   node tools/gen-shape-levels.js && node tools/merge-shape-levels.js');
lines.push('// Format: { cols, rows, t?, arrows: [{c, d}] }. Cells listed tail→head;');
lines.push('// d is the escape direction (0=R 1=U 2=L 3=D). `t` is the shape id shown');
lines.push('// by the in-game silhouette reveal.');
lines.push('');
lines.push('const HANDCRAFTED_LEVELS = {');
for (const k of KEEP) lines.push(`${k}:${serializeLevel(existing[k])},`);
for (const l of SLOTS) lines.push(`${l}:${serializeLevel(shapes[l])},`);
lines.push('};');
lines.push('');
lines.push("if(typeof module!=='undefined'&&module.exports)module.exports=HANDCRAFTED_LEVELS;");
lines.push("if(typeof window!=='undefined')window.HANDCRAFTED_LEVELS=HANDCRAFTED_LEVELS;");
lines.push('');

const out = lines.join('\n');
if (Buffer.byteLength(out) > MAX_BYTES) {
  console.error(`output is ${(Buffer.byteLength(out) / 1048576).toFixed(2)} MB — over the ${MAX_BYTES / 1048576} MB gate`);
  process.exit(1);
}
fs.writeFileSync(OUT, out);
const total = KEEP.length + SLOTS.length;
console.log(`wrote ${OUT}: ${total} levels (${KEEP.length} kept + ${SLOTS.length} shape), ${(Buffer.byteLength(out) / 1048576).toFixed(2)} MB`);
