# Stray Arrows

Sliding-arrow puzzle game for iOS and Android. Vanilla JS + HTML5 Canvas wrapped in
Capacitor 8. Single-file `index.html` (~4000 lines), **461 hand-tuned levels +
605 imported (Rush Hour) + 500 baked + procedural fallback** — total ~1500
unique boards before the procedural generator takes over.

## Quick start

```sh
npm install              # Capacitor + AdMob plugin
npm run build            # auto-syncs versions then copies to www/
npm run sync             # build + npx cap sync (updates iOS/Android)
npm run open:ios         # opens Xcode for iOS build
npm run open:android     # opens Android Studio
```

Other useful scripts:

```sh
npm run lint             # ESLint flat config (tools/ + sw.js)
npm run audit:check      # npm audit, fail on high+ severity
npm run validate         # handcrafted + imported level data
npm run regen-assets     # regenerate icons/splashes from resources/*.svg
npm run import-rushhour  # re-run Rush Hour importer (needs tools/data/rush.txt)
```

To run locally in a browser:
```sh
python3 -m http.server 8081
# open http://localhost:8081/index.html
```

URL flags: `?level=N` jumps to level N. `?fresh=1` bypasses baked
levels and re-generates procedurally (QA only).

## Project layout

| Path | What |
|------|------|
| `index.html` | the whole game — UI, audio, ads, level loader, render loop |
| `handcrafted-levels.js` | 461 levels (1-5 tutorial + arrowsgo imports) |
| `levels-baked.js` | 500 procedurally pre-baked levels (fallback) |
| `sw.js` | Service Worker — versioned cache |
| `manifest.json` | PWA manifest |
| `sounds/` | tap, swoosh, complete, gameover MP3s |
| `www/` | **build output** — Capacitor's `webDir` points here |
| `ios/` | Xcode project |
| `android/` | Gradle project |
| `tools/` | level editor, generator (Python), validator |
| `capacitor.config.json` | Capacitor + plugins config |
| `STORE_LISTING.md` | App Store / Play descriptions, screenshots, age rating |
| `privacy-policy.html` | hosted privacy policy |

## Levels

- **1-5**: hand-built tutorial (small grids, teaches mechanics)
- **6-20**: arrowsgo levels 1-15 (denser, real puzzles)
- **21+**: every 5th level (`25, 30, 35, ...`) is arrowsgo `16, 17, 18, ...`;
  the rest fall through to baked levels.

To replace a level: edit `handcrafted-levels.js`, then bump `?v=` in the
`<script src="handcrafted-levels.js?v=N">` tag in `index.html`. Run
`npm run build` to copy to `www/`.

To design new levels: open `tools/level-editor.html` in a browser. Drag-to-draw
arrows. "Save lvl locally" stores to `localStorage`. "Export ALL saved" emits
the JSON ready to paste into `handcrafted-levels.js`.

To validate everything still solvable: `node tools/validate-handcrafted.js`.

## Versioning

`package.json` is the single source of truth. `tools/sync-versions.js`
propagates the version to:

- `sw.js` → `CACHE_NAME = 'stray-arrows-vX.Y.Z'`
- `index.html` → `APP_VERSION = 'vX.Y.Z'`
- `android/app/build.gradle` → `versionName + versionCode`
- iOS pbxproj → `MARKETING_VERSION + CURRENT_PROJECT_VERSION`

The script runs as the `prebuild` and `version` npm hooks, so any of:

```sh
npm version patch       # bumps package.json + auto-syncs the rest + git stages
npm version minor       # 1.0.x → 1.1.0
npm version major       # 1.x.y → 2.0.0
npm run build           # also syncs (for plain-build cases)
```

CI verifies the working tree stays clean after running `sync-versions.js`,
so a manually-edited mismatch fails build instead of shipping.

## Storage

LocalStorage keys all prefixed `ae_`. Helpers `_safeJSON(k)` and `_safeSet(k,v)`
silently survive parse errors and `QuotaExceededError`. List of keys is in
`index.html` — search for `_safeSet(`.

## AdMob

`@capacitor-community/admob`. Real production ad unit IDs are in `index.html`
around line 1118. Per the audit, these should eventually move into
`capacitor.config.json` so they don't ship in JS source — but they aren't
secrets in the cryptographic sense; they identify your AdMob slot.

The Android `keystore.properties` is gitignored — keep an offsite copy or
you can't sign the next release.

## Ship checklist

1. `node tools/release-checklist.js` — runs every gate (working tree clean,
   versions in sync, CHANGELOG mentions current version, lint, audit,
   level validate, build) and exits non-zero if anything's wrong.
2. Update `CHANGELOG.md` with the new version's entry (move items from
   `[Unreleased]` to `[X.Y.Z] — YYYY-MM-DD`).
3. `npm version patch|minor|major` — bumps every version field, runs the
   `version` git hook to stage them, and creates the version commit + tag.
4. `git push --follow-tags` — pushing the `v*` tag triggers the
   `release-android.yml` workflow, which builds + signs the AAB and
   attaches it to a GitHub Release.
5. **iOS (still manual):** open Xcode → Archive → upload to App Store Connect.
   Documented gap; full automation is a v2.1 task (Apple credentials in CI).
6. Download the AAB from the GitHub Release → upload to Play Console
   Production. (Optional: enable the commented Play Console auto-upload
   step in `.github/workflows/release-android.yml` once you have a
   service-account JSON.)

### Required GitHub Secrets

For the Android release workflow (`Settings → Secrets and variables → Actions`):

| Secret | What |
|--------|------|
| `ANDROID_KEYSTORE_BASE64` | `base64 -i arrow-escape.keystore \| pbcopy` |
| `ANDROID_KEYSTORE_PASSWORD` | from `android/keystore.properties` |
| `ANDROID_KEY_ALIAS` | from `android/keystore.properties` |
| `ANDROID_KEY_PASSWORD` | from `android/keystore.properties` |
| `PLAY_STORE_SERVICE_ACCOUNT_JSON` | optional, for auto-Play-Console upload |

## Audits

- `AUDIT-2026-05-05.md` — most recent
- `AUDIT-2026-05-01.md`, `AUDIT-2026-04-28.md` — older snapshots
