#!/usr/bin/env node
// Shape-level generator — packs every cell of a picture mask (tools/
// shape-masks.js) with snake arrows and certifies solvability BY
// CONSTRUCTION, so the in-game greedy unwind (_isLevelSolvable) always
// agrees. Deterministic seeds → reproducible output.
//
// Pipeline per level slot:
//   1. rasterize mask to the tier's scale, board = bbox + 1-cell margin
//   2. PACK: P1 competitive growth → P2 end-absorption → P3 orphan repair
//      (100% mask coverage, min snake len 2)
//   3. PEEL: simulate the solve forward; each snake's orientation (which
//      end is the head) is fixed the moment it's peeled. Finishing the
//      peel IS the solvability certificate. Depth is shaped by preferring
//      picks whose *opposite* orientation has many blockers (spend the
//      outward-pointing options early, keep inward-pointing for later
//      waves). Backtracking + restarts on stalls.
//   4. METRICS: waves / chain / initialOpen / avgBlockers — accept if in
//      the tier's difficulty band, else next seed (up to 400 per slot,
//      best reject kept as fallback and logged in the manifest).
//
// Output: tools/out/shape-levels.json + tools/out/shape-manifest.json
// Merge into handcrafted-levels.js with tools/merge-shape-levels.js.
//
// CLI:
//   node tools/gen-shape-levels.js              # all 441 slots
//   node tools/gen-shape-levels.js --slot 25    # one slot (debug print)
//   node tools/gen-shape-levels.js --shape cat --tier B   # one-off debug

'use strict';

const fs = require('fs');
const path = require('path');
const { MASKS, SHAPE_NAMES, MULTI_OK, composeNumber, validateMask, rasterize, toBoard } = require('./shape-masks.js');

// Game direction encoding: 0=R 1=U 2=L 3=D (index.html DX/DY).
const DIRS = [[0, 1], [-1, 0], [0, -1], [1, 0]]; // [dr,dc] for d=0..3
function dirOf(dr, dc) {
  if (dr === 0 && dc === 1) return 0;
  if (dr === -1 && dc === 0) return 1;
  if (dr === 0 && dc === -1) return 2;
  if (dr === 1 && dc === 0) return 3;
  throw new Error('bad step ' + dr + ',' + dc);
}

// ── Deterministic RNG ────────────────────────────────────────────────
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
function weightedLen(rng, table) {
  let tot = 0;
  for (const [, w] of table) tot += w;
  let x = rng() * tot;
  for (const [v, w] of table) { x -= w; if (x <= 0) return v; }
  return table[table.length - 1][0];
}

// ── Tiers ────────────────────────────────────────────────────────────
// Difficulty bands are calibrated against the SHIPPING handcrafted
// milestones (2026-07 sweep): those run initialOpen 6-23 (median ~12),
// waves 15-38. The bands below undercut that open-ness by ~2× at every
// tier — generated shape levels play noticeably tighter than the levels
// they replace — while staying reachable within the seed budget.
const TIERS = {
  A: {
    scale: 1.0, bias: 0.55,
    lens: [[3, 3], [4, 4], [5, 4], [6, 3], [7, 2], [8, 1], [9, 1]],
    anchors: 0, anchorLen: [0, 0],
    band: { openMax: 3, wavesMin: 5, chainMin: 4 },
  },
  B: {
    scale: 1.5, bias: 0.70,
    lens: [[3, 2], [4, 3], [5, 4], [6, 3], [7, 2], [8, 2], [9, 1], [10, 1], [12, 0.5]],
    anchors: 0, anchorLen: [0, 0],
    band: { openMax: 5, wavesMin: 10, chainMin: 7 },
  },
  C: {
    scale: 2.0, bias: 0.85,
    lens: [[3, 2], [4, 3], [5, 4], [6, 3], [7, 2], [8, 2], [9, 1], [10, 1], [12, 1], [14, 0.5]],
    anchors: 3, anchorLen: [15, 20],
    band: { openMax: 7, wavesMin: 14, chainMin: 9 },
  },
};
function tierOf(lvl) { return lvl < 500 ? 'A' : lvl < 1200 ? 'B' : 'C'; }

// Digit milestones read best near design scale — long numbers get wide
// fast, so cap their scale regardless of tier.
function scaleFor(shapeId, tier, isDigit) {
  if (!isDigit) return TIERS[tier].scale;
  const nDigits = shapeId.length;
  if (nDigits <= 2) return tier === 'A' ? 1.0 : 1.5;
  if (nDigits === 3) return tier === 'C' ? 1.5 : 1.0;
  return 1.25; // 4-digit (2×2 stacked, 16×24 design) → 20×30
}

// ── Packing ──────────────────────────────────────────────────────────
// occ: Int16Array board, -2 outside mask, -1 empty mask cell, ≥0 snake id.
const N4 = [[0, 1], [0, -1], [1, 0], [-1, 0]];

function buildBoard(maskRows) {
  const b = toBoard(maskRows);
  const occ = new Int16Array(b.rows * b.cols).fill(-2);
  for (const [r, c] of b.cells) occ[r * b.cols + c] = -1;
  return { rows: b.rows, cols: b.cols, occ, maskCells: b.cells.map(([r, c]) => r * b.cols + c) };
}

// Grow one self-avoiding snake from `start` through empty mask cells.
// Turn-biased (straight runs capped at 2) so the fill reads woven.
function growSnake(board, rng, start, targetLen) {
  const { occ, cols } = board;
  const cells = [start];
  occ[start] = -3; // temp claim
  let prevDelta = null, straightRun = 0;
  while (cells.length < targetLen) {
    const cur = cells[cells.length - 1];
    const r = (cur / cols) | 0, c = cur % cols;
    const options = [];
    for (const [dr, dc] of N4) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= board.rows || nc < 0 || nc >= cols) continue;
      const ni = nr * cols + nc;
      if (occ[ni] !== -1) continue;
      const straight = prevDelta && dr === prevDelta[0] && dc === prevDelta[1];
      if (straight && straightRun >= 2) continue; // force a turn
      // weight: prefer turns, prefer hugging occupied cells (tight pack)
      let w = straight ? 1 : 3;
      let occN = 0;
      for (const [ar, ac] of N4) {
        const xr = nr + ar, xc = nc + ac;
        if (xr < 0 || xr >= board.rows || xc < 0 || xc >= cols) continue;
        if (occ[xr * cols + xc] >= 0) occN++;
      }
      w += occN;
      options.push({ ni, dr, dc, w });
    }
    if (!options.length) break;
    let tot = 0;
    for (const o of options) tot += o.w;
    let x = rng() * tot, chosen = options[options.length - 1];
    for (const o of options) { x -= o.w; if (x <= 0) { chosen = o; break; } }
    if (prevDelta && chosen.dr === prevDelta[0] && chosen.dc === prevDelta[1]) straightRun++;
    else straightRun = 1;
    prevDelta = [chosen.dr, chosen.dc];
    cells.push(chosen.ni);
    occ[chosen.ni] = -3;
  }
  return cells;
}

function pack(board, rng, tier) {
  const { occ, cols } = board;
  const T = TIERS[tier];
  const snakes = [];
  const commit = (cells) => {
    const id = snakes.length;
    for (const i of cells) occ[i] = id;
    snakes.push(cells);
    return id;
  };
  const release = (cells) => { for (const i of cells) occ[i] = -1; };

  // P0 — anchors (tier C): a few long snakes first, from random starts.
  for (let a = 0; a < T.anchors; a++) {
    const empties = board.maskCells.filter((i) => occ[i] === -1);
    if (!empties.length) break;
    const target = T.anchorLen[0] + Math.floor(rng() * (T.anchorLen[1] - T.anchorLen[0] + 1));
    let best = null;
    for (let t = 0; t < 12; t++) {
      const cells = growSnake(board, rng, pick(rng, empties), target);
      if (!best || cells.length > best.length) { release(cells.filter((c) => occ[c] === -3)); best = cells; }
      else release(cells);
      // growSnake left temp claims; release them and re-claim best at end
      for (const i of cells) if (occ[i] === -3) occ[i] = -1;
      if (best.length >= target) break;
    }
    if (best && best.length >= Math.max(8, T.anchorLen[0] * 0.6)) commit(best);
  }

  // P1 — competitive growth until no start yields len ≥ 3.
  let guard = 0;
  while (guard++ < 10000) {
    const empties = board.maskCells.filter((i) => occ[i] === -1);
    if (!empties.length) break;
    let placed = false;
    // a few random starts per round
    for (let t = 0; t < 8 && !placed; t++) {
      const start = pick(rng, empties);
      if (occ[start] !== -1) continue;
      const target = weightedLen(rng, T.lens);
      const cells = growSnake(board, rng, start, target);
      if (cells.length >= 3) { for (const i of cells) occ[i] = -1; commit(cells); placed = true; }
      else { for (const i of cells) if (occ[i] === -3) occ[i] = -1; }
    }
    if (!placed) break;
  }

  // P2 — absorption: extend snake ENDS into adjacent empties, to fixpoint.
  let changed = true;
  while (changed) {
    changed = false;
    for (let s = 0; s < snakes.length; s++) {
      const cells = snakes[s];
      for (const end of [0, 1]) {
        const idx = end === 0 ? 0 : cells.length - 1;
        const cur = cells[idx];
        const r = (cur / cols) | 0, c = cur % cols;
        for (const [dr, dc] of N4) {
          const nr = r + dr, nc = c + dc;
          if (nr < 0 || nr >= board.rows || nc < 0 || nc >= cols) continue;
          const ni = nr * cols + nc;
          if (occ[ni] !== -1) continue;
          if (end === 0) cells.unshift(ni); else cells.push(ni);
          occ[ni] = s;
          changed = true;
          break;
        }
      }
    }
  }

  // P3 — orphan repair: guarantee 100% coverage, min len 2.
  let empties = board.maskCells.filter((i) => occ[i] === -1);
  let stuckPasses = 0;
  while (empties.length) {
    let progress = false;
    for (const o of empties) {
      if (occ[o] !== -1) continue;
      const r = (o / cols) | 0, c = o % cols;
      const neighbors = [];
      for (const [dr, dc] of N4) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= board.rows || nc < 0 || nc >= cols) continue;
        const ni = nr * cols + nc;
        if (occ[ni] >= 0) neighbors.push(ni);
      }
      let done = false;
      for (const n of neighbors) {
        const s = occ[n];
        const cells = snakes[s];
        const k = cells.indexOf(n);
        if (k === 0) { cells.unshift(o); occ[o] = s; done = true; break; }
        if (k === cells.length - 1) { cells.push(o); occ[o] = s; done = true; break; }
        // split variants — both halves must keep len ≥ 2
        const N = cells.length;
        if (N - k - 1 >= 2 && k + 2 >= 2) { // left-attach: [0..k]+o | [k+1..]
          const s1 = cells.slice(0, k + 1); s1.push(o);
          const s2 = cells.slice(k + 1);
          snakes[s] = s1;
          const id2 = snakes.length;
          snakes.push(s2);
          occ[o] = s;
          for (const i of s2) occ[i] = id2;
          done = true; break;
        }
        if (k >= 2) { // right-attach: [0..k-1] | o+[k..]
          const s1 = cells.slice(0, k);
          const s2 = [o, ...cells.slice(k)];
          snakes[s] = s1;
          const id2 = snakes.length;
          snakes.push(s2);
          for (const i of s2) occ[i] = id2;
          done = true; break;
        }
      }
      if (done) progress = true;
    }
    empties = board.maskCells.filter((i) => occ[i] === -1);
    if (!progress) {
      if (++stuckPasses > 2) return null; // pathological — reseed
    } else stuckPasses = 0;
  }

  // sanity: contiguity + min len (belt and suspenders)
  for (const cells of snakes) {
    if (cells.length < 2) return null;
    for (let i = 1; i < cells.length; i++) {
      const a = cells[i - 1], b = cells[i];
      const dr = Math.abs(((a / cols) | 0) - ((b / cols) | 0));
      const dc = Math.abs((a % cols) - (b % cols));
      if (dr + dc !== 1) return null;
    }
  }
  return snakes;
}

// A snake is "free both ways" when NEITHER orientation's escape ray
// crosses any other snake — flipping can never make it initially-blocked,
// so it inflates initialOpen irreducibly. Such snakes hug the convex
// boundary. Cure: merge them end-to-end into a neighbouring snake (cells
// don't move, the merged snake's rays change). Run before the peel.
function mergeFreeSnakes(board, snakes, openMax, maxLen, rng) {
  const { occ, cols } = board;
  const endAdj = (cell) => {
    const r = (cell / cols) | 0, c = cell % cols;
    const out = [];
    for (const [dr, dc] of N4) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= board.rows || nc < 0 || nc >= cols) continue;
      const id = occ[nr * cols + nc];
      if (id >= 0) out.push({ id, cell: nr * cols + nc });
    }
    return out;
  };
  for (let guard = 0; guard < 40; guard++) {
    const freeIds = [];
    const freeSet = new Set();
    for (let i = 0; i < snakes.length; i++) {
      if (!snakes[i]) continue;
      const b0 = rayBlockers(board, snakes, snakes[i], 0).blockers.size;
      const b1 = rayBlockers(board, snakes, snakes[i], 1).blockers.size;
      if (b0 === 0 && b1 === 0) { freeIds.push(i); freeSet.add(i); }
    }
    if (freeIds.length <= openMax) break;
    let merged = false;
    for (let k = freeIds.length - 1; k > 0; k--) { // shuffle
      const j = Math.floor(rng() * (k + 1));
      [freeIds[k], freeIds[j]] = [freeIds[j], freeIds[k]];
    }
    for (const s of freeIds) {
      const cells = snakes[s];
      if (!cells) continue;
      const tries = [];
      for (const end of [0, 1]) {
        const e = end === 0 ? cells[0] : cells[cells.length - 1];
        for (const { id, cell } of endAdj(e)) {
          if (id === s || !snakes[id]) continue;
          const t = snakes[id];
          const k = t.indexOf(cell);
          const tEnd = k === 0 ? 0 : k === t.length - 1 ? 1 : -1;
          if (tEnd >= 0) {
            if (cells.length + t.length > maxLen) continue;
            tries.push({ id, sEnd: end, tEnd, k: -1, pref: freeSet.has(id) ? 1 : 0 });
          } else {
            // interior attach: split t at k, absorb t[0..k] (or t[k..end])
            // into s, leave the other part (must keep len ≥ 2) as snake id.
            if (k + 1 >= 2 && t.length - k - 1 >= 2 && cells.length + k + 1 <= maxLen) {
              tries.push({ id, sEnd: end, tEnd: -1, k, side: 0, pref: 2 + (freeSet.has(id) ? 1 : 0) });
            }
            if (t.length - k >= 2 && k >= 2 && cells.length + (t.length - k) <= maxLen) {
              tries.push({ id, sEnd: end, tEnd: -1, k, side: 1, pref: 2 + (freeSet.has(id) ? 1 : 0) });
            }
          }
        }
      }
      tries.sort((a, b) => a.pref - b.pref);
      if (!tries.length) continue;
      const tr = tries[0];
      const t = snakes[tr.id];
      let mergedCells;
      if (tr.tEnd >= 0) {
        // end-to-end merge; s disappears into t's slot
        if (tr.sEnd === 1 && tr.tEnd === 0) mergedCells = [...cells, ...t];
        else if (tr.sEnd === 1 && tr.tEnd === 1) mergedCells = [...cells, ...[...t].reverse()];
        else if (tr.sEnd === 0 && tr.tEnd === 1) mergedCells = [...t, ...cells];
        else mergedCells = [...[...t].reverse(), ...cells];
        snakes[tr.id] = mergedCells;
        snakes[s] = null;
        for (const c of mergedCells) occ[c] = tr.id;
      } else {
        // interior split-merge: s absorbs one half of t
        const sPath = tr.sEnd === 1 ? cells : [...cells].reverse(); // ends at e
        let absorbed, remainder;
        if (tr.side === 0) { absorbed = t.slice(0, tr.k + 1).reverse(); remainder = t.slice(tr.k + 1); }
        else { absorbed = t.slice(tr.k); remainder = t.slice(0, tr.k); }
        mergedCells = [...sPath, ...absorbed];
        snakes[s] = mergedCells;
        snakes[tr.id] = remainder;
        for (const c of mergedCells) occ[c] = s;
        for (const c of remainder) occ[c] = tr.id;
      }
      merged = true;
      break;
    }
    if (!merged) break;
  }
  // compact: drop null slots, rewrite occ ids
  const out = [];
  for (const cells of snakes) if (cells) out.push(cells);
  for (let i = 0; i < out.length; i++) for (const c of out[i]) occ[c] = i;
  return out;
}

// ── Peel: orientation + solvability certificate ──────────────────────
// For both orientations of every snake, precompute the SET of other snake
// ids sitting on its escape ray (occ is static during the peel).
function rayBlockers(board, snakes, cells, flip) {
  const { occ, cols, rows } = board;
  const ordered = flip ? [...cells].reverse() : cells;
  const head = ordered[ordered.length - 1];
  const prev = ordered[ordered.length - 2];
  const dr = ((head / cols) | 0) - ((prev / cols) | 0);
  const dc = (head % cols) - (prev % cols);
  const d = dirOf(dr, dc);
  const self = occ[head];
  const set = new Set();
  let r = ((head / cols) | 0) + dr, c = (head % cols) + dc;
  while (r >= 0 && r < rows && c >= 0 && c < cols) {
    const id = occ[r * cols + c];
    if (id >= 0 && id !== self) set.add(id);
    r += dr; c += dc;
  }
  return { d, blockers: set };
}

function peel(board, snakes, rng, bias, budget = 1200) {
  const n = snakes.length;
  const info = snakes.map((cells, i) => [
    rayBlockers(board, snakes, cells, 0),
    rayBlockers(board, snakes, cells, 1),
  ]);
  // How many (snake, orientation) rays does i sit on? Removing a high-
  // "unlock" snake turns more future picks into covered (zero-open) ones.
  const unlock = new Array(n).fill(0);
  for (let j = 0; j < n; j++)
    for (let f = 0; f < 2; f++)
      for (const b of info[j][f].blockers) unlock[b]++;
  const alive = new Set(snakes.map((_, i) => i));
  const orientation = new Array(n).fill(-1);
  const stack = []; // frames: {choices, tried, chosenIdx, snake}
  let steps = 0;

  // A pick whose STATIC blocker set is empty will be open in the initial
  // board no matter what (all snakes present can't block it) — every such
  // pick is +1 initialOpen. Prefer picks whose blockers were all already
  // peeled (clear now, blocked initially): they add ZERO to initialOpen.
  const freeChoices = () => {
    const out = [];
    for (const i of alive) {
      for (let f = 0; f < 2; f++) {
        let blocked = false;
        for (const b of info[i][f].blockers) { if (alive.has(b)) { blocked = true; break; } }
        if (!blocked) {
          // opposite orientation's blockers still alive = depth potential;
          // unlock = how many rays this snake sits on (bottleneck weight)
          let opp = 0;
          for (const b of info[i][1 - f].blockers) if (alive.has(b)) opp++;
          out.push({ i, f, opp: opp + unlock[i] * 2, opens: info[i][f].blockers.size === 0 ? 1 : 0 });
        }
      }
    }
    return out;
  };

  while (alive.size) {
    if (++steps > budget) return null;
    let frame = stack.length && stack[stack.length - 1].pending ? stack.pop() : null;
    let choices, tried;
    if (frame) { ({ choices, tried } = frame); }
    else {
      choices = freeChoices();
      tried = new Set();
    }
    const untried = choices.filter((c) => !tried.has(c.i * 2 + c.f));
    if (!untried.length) {
      // dead end — undo previous pick
      if (!stack.length) return null;
      const prev = stack.pop();
      alive.add(prev.snake);
      orientation[prev.snake] = -1;
      prev.pending = true;
      stack.push(prev);
      continue;
    }
    // Never spend an open-forever pick while a covered pick exists.
    const covered = untried.filter((c) => !c.opens);
    const pool = covered.length ? covered : untried;
    let chosen;
    if (rng() < bias) {
      let best = -1;
      for (const c of pool) if (c.opp > best) best = c.opp;
      const top = pool.filter((c) => c.opp === best);
      chosen = pick(rng, top);
    } else chosen = pick(rng, pool);
    tried.add(chosen.i * 2 + chosen.f);
    orientation[chosen.i] = chosen.f;
    alive.delete(chosen.i);
    stack.push({ choices, tried, snake: chosen.i, pending: false });
  }
  return orientation;
}

// ── Metrics on the final configuration ──────────────────────────────
function metrics(board, snakes, orientation) {
  const { occ, cols, rows } = board;
  const n = snakes.length;
  const deps = [];
  for (let i = 0; i < n; i++) {
    const { blockers } = rayBlockers(board, snakes, snakes[i], orientation[i]);
    deps.push(blockers);
  }
  const rem = new Set(Array.from({ length: n }, (_, i) => i));
  const waves = [];
  while (rem.size) {
    const ready = [];
    for (const i of rem) {
      let ok = true;
      for (const b of deps[i]) if (rem.has(b)) { ok = false; break; }
      if (ok) ready.push(i);
    }
    if (!ready.length) return null; // unsolvable — must never happen post-peel
    waves.push(ready);
    for (const i of ready) rem.delete(i);
  }
  const memo = new Array(n).fill(0);
  const chainOf = (i, seen) => {
    if (memo[i]) return memo[i];
    if (seen.has(i)) return 1;
    seen.add(i);
    let m = 0;
    for (const b of deps[i]) m = Math.max(m, chainOf(b, seen));
    seen.delete(i);
    memo[i] = 1 + m;
    return memo[i];
  };
  let chain = 0, blockSum = 0;
  for (let i = 0; i < n; i++) {
    chain = Math.max(chain, chainOf(i, new Set()));
    blockSum += deps[i].size;
  }
  return {
    arrows: n,
    initialOpen: waves[0].length,
    waves: waves.length,
    chain,
    avgBlockers: blockSum / n,
    open: waves[0],
  };
}

// Post-peel repair: flipping a snake's orientation doesn't move any cell,
// so OTHER snakes' dependencies are untouched — only the flipped snake's
// own escape ray changes. That makes "too many initially-open arrows"
// cheaply fixable: flip an open snake so its ray gets blocked, re-verify
// solvability (metrics ≠ null), keep if initialOpen dropped.
function flipRepair(board, snakes, orientation, band, rng) {
  let m = metrics(board, snakes, orientation);
  let guard = 0;
  while (m && m.initialOpen > band.openMax && guard++ < 40) {
    const order = [...m.open];
    // shuffle so repeated repairs don't always pick the same snake
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    let flipped = false;
    for (const i of order) {
      if (m.open.length <= 1) break; // must keep at least one opener
      orientation[i] = 1 - orientation[i];
      const m2 = metrics(board, snakes, orientation);
      if (m2 && m2.initialOpen < m.initialOpen) { m = m2; flipped = true; break; }
      orientation[i] = 1 - orientation[i]; // revert
    }
    if (!flipped) break;
  }
  return m;
}

// ── Level assembly ───────────────────────────────────────────────────
function buildLevel(board, snakes, orientation, shapeId) {
  const { cols } = board;
  const arrows = snakes.map((cells, i) => {
    const ordered = orientation[i] ? [...cells].reverse() : cells;
    const head = ordered[ordered.length - 1], prev = ordered[ordered.length - 2];
    const d = dirOf(((head / cols) | 0) - ((prev / cols) | 0), (head % cols) - (prev % cols));
    return { c: ordered.map((x) => [(x / cols) | 0, x % cols]), d };
  });
  return { cols: board.cols, rows: board.rows, t: shapeId, arrows };
}

// ── Slot → shape mapping ─────────────────────────────────────────────
function slotList() {
  const out = [];
  for (let l = 25; l <= 2225; l += 5) out.push(l);
  return out;
}
function isDigitSlot(lvl) { return lvl === 50 || (lvl % 100 === 0); }

// Deterministic shuffled round-robin over the 40 pictorial masks:
// reshuffle every cycle, never repeat a shape on consecutive slots.
function shapeAssignments() {
  const slots = slotList();
  const rng = mulberry32(fnv1a('shape-order-v1'));
  const assign = new Map();
  let bag = [];
  let last = null;
  for (const lvl of slots) {
    if (isDigitSlot(lvl)) { assign.set(lvl, String(lvl)); continue; }
    if (!bag.length) {
      bag = [...SHAPE_NAMES];
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      if (bag[bag.length - 1] === last && bag.length > 1) {
        [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
      }
    }
    const s = bag.pop();
    assign.set(lvl, s);
    last = s;
  }
  return assign;
}

// ── Per-slot generation with seed search ─────────────────────────────
function generateSlot(lvl, shapeId, opts = {}) {
  const tier = tierOf(lvl);
  const T = TIERS[tier];
  const isDigit = /^[0-9]+$/.test(shapeId);
  const designRows = isDigit ? composeNumber(shapeId) : MASKS[shapeId];
  const scale = scaleFor(shapeId, tier, isDigit);
  const maskRows = rasterize(designRows, scale);
  const maxAttempts = opts.maxAttempts || 400;

  let best = null; // {level, m, dist, attempt}
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const rng = mulberry32(fnv1a(`${shapeId}|${tier}|${lvl}|${attempt}`));
    const board = buildBoard(maskRows);
    let snakes = pack(board, rng, tier);
    if (!snakes) continue;
    const mergeMaxLen = tier === 'A' ? 12 : tier === 'B' ? 16 : 22;
    snakes = mergeFreeSnakes(board, snakes, T.band.openMax, mergeMaxLen, rng);
    // Free-both-ways snakes are +1 initialOpen no matter the orientation;
    // if the merge pass couldn't get under the band cap, this packing can
    // never fit — skip to the next seed without paying for a peel.
    let freeBoth = 0;
    for (const cells of snakes) {
      if (rayBlockers(board, snakes, cells, 0).blockers.size === 0 &&
          rayBlockers(board, snakes, cells, 1).blockers.size === 0) freeBoth++;
    }
    // Early skip only while the band is still plausibly reachable; late
    // attempts run through so a best-effort fallback always exists (some
    // masks — e.g. butterfly's four convex lobes — never get freeBoth
    // under the cap, and must not end with NO level at all).
    if (freeBoth > T.band.openMax && attempt < maxAttempts * 0.7) continue;
    let orientation = null;
    for (let p = 0; p < 5 && !orientation; p++) orientation = peel(board, snakes, rng, T.bias);
    if (!orientation) continue;
    const m = flipRepair(board, snakes, orientation, T.band, rng);
    if (!m) continue; // impossible post-peel; skip defensively
    const band = T.band;
    const inBand = m.initialOpen >= 1 && m.initialOpen <= band.openMax && m.waves >= band.wavesMin && m.chain >= band.chainMin;
    const dist = Math.max(0, m.initialOpen - band.openMax) * 3 + Math.max(0, band.wavesMin - m.waves) + Math.max(0, band.chainMin - m.chain);
    const cand = { level: buildLevel(board, snakes, orientation, shapeId), m, dist, attempt };
    if (inBand) return { ...cand, inBand: true, tier };
    if (!best || dist < best.dist) best = cand;
  }
  return best ? { ...best, inBand: false, tier } : null;
}

// ── Main ─────────────────────────────────────────────────────────────
function main() {
  const argv = process.argv.slice(2);
  const getArg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };

  if (getArg('--shape')) {
    const shapeId = getArg('--shape');
    const tier = getArg('--tier') || 'A';
    const lvl = tier === 'A' ? 25 : tier === 'B' ? 500 : 1200;
    const res = generateSlot(lvl, shapeId, { maxAttempts: 200 });
    if (!res) { console.error('FAILED to generate'); process.exit(1); }
    console.log(JSON.stringify(res.m), 'inBand:', res.inBand, 'attempt:', res.attempt);
    printLevel(res.level);
    return;
  }

  const only = getArg('--slot') ? parseInt(getArg('--slot'), 10) : null;
  const assign = shapeAssignments();
  const slots = only ? [only] : slotList();
  const out = {};
  const manifest = [];
  const t0 = Date.now();
  let misses = 0;
  for (let idx = 0; idx < slots.length; idx++) {
    const lvl = slots[idx];
    const shapeId = assign.get(lvl);
    const res = generateSlot(lvl, shapeId);
    if (!res) { console.error(`✗ lvl ${lvl} (${shapeId}) — TOTAL FAILURE`); process.exitCode = 1; continue; }
    out[lvl] = res.level;
    manifest.push({ lvl, shape: shapeId, tier: res.tier, attempt: res.attempt, inBand: res.inBand, ...res.m });
    if (!res.inBand) { misses++; console.warn(`⚠ lvl ${lvl} (${shapeId}, ${res.tier}) off-band dist=${res.dist} open=${res.m.initialOpen} waves=${res.m.waves} chain=${res.m.chain}`); }
    if ((idx + 1) % 25 === 0) console.log(`… ${idx + 1}/${slots.length} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  const outDir = path.join(__dirname, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'shape-levels.json'), JSON.stringify(out));
  fs.writeFileSync(path.join(outDir, 'shape-manifest.json'), JSON.stringify(manifest, null, 1));
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`\nDone: ${Object.keys(out).length} levels in ${secs}s, ${misses} off-band (see manifest).`);
  if (only && out[only]) printLevel(out[only]);
}

function printLevel(level) {
  const grid = Array.from({ length: level.rows }, () => new Array(level.cols).fill('.'));
  const glyph = ['→', '↑', '←', '↓'];
  level.arrows.forEach((a) => {
    for (const [r, c] of a.c) grid[r][c] = '#';
    const [hr, hc] = a.c[a.c.length - 1];
    grid[hr][hc] = glyph[a.d];
  });
  console.log(grid.map((row) => row.join('')).join('\n'));
  console.log(`${level.cols}×${level.rows}, ${level.arrows.length} arrows, shape=${level.t}`);
}

if (require.main === module) main();

module.exports = { generateSlot, shapeAssignments, slotList, tierOf, TIERS };
