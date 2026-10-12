#!/usr/bin/env node
// Rewrites handcrafted-levels.js from the shape-generator output:
//   • keys 25..2225 step 5 come from tools/out/shape-levels.json, each
//     with a `t` shape-id used by the in-game silhouette reveal; every
//     other level, 1-20 included, is built at runtime by the generator

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
const SHAPES = path.join(__dirname, 'out', 'shape-levels.json');
const OUT = path.join(ROOT, 'handcrafted-levels.js'); // rewritten in place (git is the safety net)
const MAX_BYTES = 4.5 * 1024 * 1024;

const shapes = JSON.parse(fs.readFileSync(SHAPES, 'utf8'));

// v2.1: a picture every 5th level, nothing else. The pre-2.0 curated 1-20
// were the weakest boards in the game and the dense 21..300 block ran far
// smaller than the generator's boards around it — both now come from the
// runtime generator, so they no longer ship as data.
const SLOTS = [];
for (let l = 25; l <= 2225; l += 5) SLOTS.push(l);

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
lines.push('// GENERATED SHAPE LEVELS at every 5th level (25..2225): hearts, stars,');
lines.push('// animals, objects, and digit numbers at 50/100/…/2200. Every other');
lines.push('// level is built at runtime by generateLevel(). Regenerate with:');

lines.push('//   node tools/gen-shape-levels.js && node tools/merge-shape-levels.js');
lines.push('// Format: { cols, rows, t?, arrows: [{c, d}] }. Cells listed tail→head;');
lines.push('// d is the escape direction (0=R 1=U 2=L 3=D). `t` is the shape id shown');
lines.push('// by the in-game silhouette reveal.');
lines.push('');
lines.push('const HANDCRAFTED_LEVELS = {');
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
console.log(`wrote ${OUT}: ${SLOTS.length} shape levels, ${(Buffer.byteLength(out) / 1048576).toFixed(2)} MB`);

