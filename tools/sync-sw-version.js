#!/usr/bin/env node
// Syncs every place the version string lives with package.json.
// Single source of truth: package.json → sw.js CACHE_NAME, index.html APP_VERSION.
//
// Why: previously each spot was edited by hand. Forgetting any one of them
// caused real shipped bugs:
//   - sw.js: stale CACHE_NAME → users kept seeing the old build for days
//   - index.html APP_VERSION: in-app "v1.0.15" while the bundle was actually
//     1.0.16, breaking the auto-update banner's freshness comparison
// Run as the `prebuild` npm hook so `npm run build` is always consistent.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SW_PATH = path.join(ROOT, 'sw.js');
const INDEX_PATH = path.join(ROOT, 'index.html');
const PKG_PATH = path.join(ROOT, 'package.json');

const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
const version = pkg.version;
if (!version) {
  console.error('[sync-versions] package.json has no "version" field');
  process.exit(1);
}

let changed = 0;

// --- sw.js: const CACHE_NAME = 'stray-arrows-vX.Y.Z';
{
  const sw = fs.readFileSync(SW_PATH, 'utf8');
  const re = /const CACHE_NAME = '([^']+)';/;
  const match = sw.match(re);
  if (!match) {
    console.error('[sync-versions] could not find CACHE_NAME line in sw.js');
    process.exit(1);
  }
  const expected = `stray-arrows-v${version}`;
  if (match[1] !== expected) {
    fs.writeFileSync(SW_PATH, sw.replace(re, `const CACHE_NAME = '${expected}';`));
    console.log(`[sync-versions] sw.js CACHE_NAME: ${match[1]} -> ${expected}`);
    changed++;
  }
}

// --- index.html: const APP_VERSION='vX.Y.Z';
{
  const html = fs.readFileSync(INDEX_PATH, 'utf8');
  const re = /const APP_VERSION='v([^']+)';/;
  const match = html.match(re);
  if (!match) {
    console.error('[sync-versions] could not find APP_VERSION line in index.html');
    process.exit(1);
  }
  if (match[1] !== version) {
    fs.writeFileSync(INDEX_PATH, html.replace(re, `const APP_VERSION='v${version}';`));
    console.log(`[sync-versions] index.html APP_VERSION: v${match[1]} -> v${version}`);
    changed++;
  }
}

if (changed === 0) {
  console.log(`[sync-versions] all in sync at v${version}`);
}
