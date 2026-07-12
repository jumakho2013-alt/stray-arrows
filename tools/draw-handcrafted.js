// ASCII render of handcrafted levels — sanity check for shape readability.
// Each cell prints arrow direction symbol on heads, '#' on body, '.' on empty.

const HC = require('../handcrafted-levels.js');
const SYMBOLS = ['→', '↑', '←', '↓'];

function render(level) {
  const grid = [];
  for (let r = 0; r < level.rows; r++) {
    grid.push(new Array(level.cols).fill('·'));
  }
  for (const a of level.arrows) {
    for (let i = 0; i < a.c.length; i++) {
      const [r, c] = a.c[i];
      if (i === a.c.length - 1) {
        grid[r][c] = SYMBOLS[a.d];
      } else {
        grid[r][c] = '#';
      }
    }
  }
  return grid.map(row => row.join(' ')).join('\n');
}

const levels = Object.keys(HC).sort((a, b) => +a - +b);
for (const lvl of levels) {
  console.log(`\n═══ LEVEL ${lvl} (${HC[lvl].arrows.length} arrows, ${HC[lvl].rows}×${HC[lvl].cols}) ═══`);
  console.log(render(HC[lvl]));
}
