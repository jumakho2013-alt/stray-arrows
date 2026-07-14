#!/usr/bin/env node
// Single source of truth: package.json `version`. This script propagates it
// to every other place the version lives:
//
//   • sw.js           CACHE_NAME      'stray-arrows-vX.Y.Z'
//   • index.html      APP_VERSION     'vX.Y.Z'
//   • android/app/build.gradle  versionName "X.Y.Z"   versionCode +=1 if changed
//   • ios pbxproj     MARKETING_VERSION = X.Y.Z;       CURRENT_PROJECT_VERSION +=1
//
// Bumping by hand five places is how every prior release shipped with at
// least one stale value (sw.js cached the old build for users; APP_VERSION
// in the menu read 1.0.15 while the bundle was 1.0.16). Now you only edit
// package.json (or run `npm version patch`) and this script aligns the rest.
//
// Wired into package.json as the `version` npm hook AND the `prebuild` hook
// so a manual `npm run build` also catches drift.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SW_PATH = path.join(ROOT, 'sw.js');
const INDEX_PATH = path.join(ROOT, 'index.html');
const PKG_PATH = path.join(ROOT, 'package.json');
const GRADLE_PATH = path.join(ROOT, 'android/app/build.gradle');
const PBXPROJ_PATH = path.join(ROOT, 'ios/App/App.xcodeproj/project.pbxproj');

const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
const version = pkg.version;
if (!version) {
  console.error('[sync-versions] package.json has no "version" field');
  process.exit(1);
}

let changed = 0;

function patchFile(filePath, label, regex, replacementFn) {
  const before = fs.readFileSync(filePath, 'utf8');
  const m = before.match(regex);
  if (!m) {
    console.error(`[sync-versions] could not find ${label} in ${path.relative(ROOT, filePath)}`);
    process.exit(1);
  }
  const after = replacementFn(before, m);
  if (after === null) return; // skip (no change needed)
  if (after !== before) {
    fs.writeFileSync(filePath, after);
    changed++;
  }
}

// --- sw.js
patchFile(SW_PATH, 'CACHE_NAME',
  /const CACHE_NAME = '([^']+)';/,
  (src, m) => {
    const expected = `stray-arrows-v${version}`;
    if (m[1] === expected) return null;
    console.log(`[sync-versions] sw.js CACHE_NAME: ${m[1]} -> ${expected}`);
    return src.replace(m[0], `const CACHE_NAME = '${expected}';`);
  });

// --- index.html
patchFile(INDEX_PATH, 'APP_VERSION',
  /const APP_VERSION='v([^']+)';/,
  (src, m) => {
    if (m[1] === version) return null;
    console.log(`[sync-versions] index.html APP_VERSION: v${m[1]} -> v${version}`);
    return src.replace(m[0], `const APP_VERSION='v${version}';`);
  });

// --- android/app/build.gradle: versionName + versionCode
// versionCode only increments when versionName actually changed — running
// the script twice in a row (e.g. prebuild + version hook) must not bump
// versionCode twice for the same version.
patchFile(GRADLE_PATH, 'Android version block',
  /versionCode (\d+)\s+versionName "([^"]+)"/,
  (src, m) => {
    const oldCode = parseInt(m[1], 10);
    const oldName = m[2];
    if (oldName === version) return null;
    const newCode = oldCode + 1;
    console.log(`[sync-versions] android: versionName ${oldName} -> ${version}, versionCode ${oldCode} -> ${newCode}`);
    return src.replace(m[0], `versionCode ${newCode}\n        versionName "${version}"`);
  });

// --- ios pbxproj: two pairs of lines (Debug + Release configurations).
// MARKETING_VERSION must match every config — Apple validates equality.
// CURRENT_PROJECT_VERSION must be unique-strictly-increasing across uploads
// to App Store Connect, regardless of marketing version, so we bump it on
// any version change.
{
  const before = fs.readFileSync(PBXPROJ_PATH, 'utf8');
  const allMV = [...before.matchAll(/MARKETING_VERSION = ([0-9.]+);/g)];
  const allCV = [...before.matchAll(/CURRENT_PROJECT_VERSION = (\d+);/g)];
  if (allMV.length === 0 || allCV.length === 0) {
    console.error('[sync-versions] could not find MARKETING_VERSION / CURRENT_PROJECT_VERSION in pbxproj');
    process.exit(1);
  }
  const oldMV = allMV[0][1];
  const oldCV = parseInt(allCV[0][1], 10);
  if (oldMV === version) {
    // no MARKETING change → no CURRENT bump (idempotent script)
  } else {
    const newCV = oldCV + 1;
    console.log(`[sync-versions] ios: MARKETING ${oldMV} -> ${version}, CURRENT_PROJECT ${oldCV} -> ${newCV}`);
    let after = before.replace(/MARKETING_VERSION = [0-9.]+;/g, `MARKETING_VERSION = ${version};`);
    after = after.replace(/CURRENT_PROJECT_VERSION = \d+;/g, `CURRENT_PROJECT_VERSION = ${newCV};`);
    fs.writeFileSync(PBXPROJ_PATH, after);
    changed++;
  }
}

if (changed === 0) {
  console.log(`[sync-versions] all in sync at v${version}`);
}
