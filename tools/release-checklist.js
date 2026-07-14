#!/usr/bin/env node
// Release pre-flight checks. Run before `npm version` + `git push --tags`.
//
//   node tools/release-checklist.js
//
// Exits 0 if everything looks ready, non-zero otherwise. Side-effect-free:
// reads files, runs read-only npm scripts. Doesn't bump anything.

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const checks = [];
let failed = 0;

function ok(label) { checks.push(`  ✓ ${label}`); }
function fail(label, why) { checks.push(`  ✗ ${label}\n      → ${why}`); failed++; }

function run(label, cmd, env) {
  try {
    execSync(cmd, { stdio: 'pipe', cwd: ROOT, env: { ...process.env, ...env } });
    ok(label);
  } catch (e) {
    fail(label, (e.stdout?.toString() || '').slice(-300) || e.message);
  }
}

console.log('Stray Arrows — release pre-flight checks');
console.log('========================================');

// 1. Working tree clean (uncommitted changes can be unintentional).
const dirty = execSync('git status --porcelain', { cwd: ROOT }).toString().trim();
if (dirty) fail('working tree clean', `uncommitted changes:\n${dirty.split('\n').slice(0, 5).map(l => '        ' + l).join('\n')}`);
else ok('working tree clean');

// 2. Versions in sync (sync-versions returns non-zero if it had to write).
try {
  execSync('node tools/sync-versions.js', { cwd: ROOT, stdio: 'pipe' });
  // If sync-versions modified anything, git diff will show it now.
  const diff = execSync('git diff --quiet sw.js index.html android/app/build.gradle ios/App/App.xcodeproj/project.pbxproj || echo dirty', { cwd: ROOT }).toString().trim();
  if (diff === 'dirty') fail('versions in sync', 'sync-versions had to bump something — commit the result');
  else ok('versions in sync (package.json ↔ sw.js ↔ index.html ↔ android ↔ ios)');
} catch (e) {
  fail('versions in sync', e.message);
}

// 3. CHANGELOG mentions the current version
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const changelog = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8');
if (changelog.includes(`[${pkg.version}]`)) ok(`CHANGELOG.md mentions [${pkg.version}]`);
else fail(`CHANGELOG.md mentions [${pkg.version}]`, `add a section with this version before tagging`);

// 4. Lint clean
run('lint clean', 'npm run lint --silent');

// 5. npm audit (high+)
run('npm audit clean (high+)', 'npm run audit:check --silent');

// 6. Levels validate (tutorial 1-20 + 441 shape levels)
run('levels valid', 'npm run validate --silent');

// 7. Build succeeds
run('build succeeds', 'npm run build --silent');

// Summary
console.log('');
console.log(checks.join('\n'));
console.log('');
if (failed) {
  console.log(`✗ ${failed} check(s) failed. Fix and re-run before tagging.`);
  process.exit(1);
} else {
  console.log(`✓ All checks passed at v${pkg.version}. Ready to tag:`);
  console.log(`    git tag v${pkg.version} && git push --tags`);
}
