# Stray Arrows

Sliding-arrow puzzle game for iOS and Android. Vanilla JS + HTML5 Canvas wrapped in
Capacitor 8. Single-file `index.html` (~6100 lines), **20 curated tutorial levels +
665 generated shape levels (EVERY level 21-300, then every 5th to 2225 —
hearts/stars/animals/digits from 83 masks) + endless procedural generation**
for everything in between and beyond.

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
npm run validate         # handcrafted level data (incl. shape levels)
npm run regen-assets     # regenerate icons/splashes from resources/*.svg
```

To run locally in a browser:
```sh
python3 -m http.server 8081
# open http://localhost:8081/index.html
```

URL flags: `?level=N` jumps to level N. `?fresh=1` bypasses handcrafted
levels and re-generates procedurally (QA only).

## Project layout

| Path | What |
|------|------|
| `index.html` | the whole game — UI, audio, ads, level loader, render loop |
| `handcrafted-levels.js` | 685 levels: 1-20 tutorial/curated + 665 generated shape levels |
| `sw.js` | Service Worker — versioned cache |
| `manifest.json` | PWA manifest |
| `sounds/` | tap, swoosh, complete, gameover MP3s |
| `www/` | **build output** — Capacitor's `webDir` points here |
| `ios/` | Xcode project |
| `android/` | Gradle project |
| `tools/` | shape-level generator, masks, validator, playtest CLI, level editor |
| `capacitor.config.json` | Capacitor + plugins config |
| `STORE_LISTING.md` | App Store / Play descriptions, screenshots, age rating |
| `privacy-policy.html` | hosted privacy policy |

## Levels

- **1-5**: hand-built tutorial (small grids, teaches mechanics)
- **6-20**: curated early levels (denser, real puzzles)
- **21-300**: EVERY level is a **generated shape level** — the arrows fill a
  picture silhouette (heart, star, cat, rocket… 83 masks); levels 50 and every
  100th spell their own number in arrows.
- **301+**: every 5th level (`305, 310, ..., 2225`) is a shape; the rest is
  procedural.

Shape-level pipeline (offline, deterministic seeds):

```sh
node tools/gen-shape-levels.js     # packs masks from tools/shape-masks.js,
                                   # certifies solvability, writes tools/out/
node tools/merge-shape-levels.js   # rewrites handcrafted-levels.js
                                   # (keys 1-20 kept verbatim)
```

Then bump `?v=` in the `<script src="handcrafted-levels.js?v=N">` tag in
`index.html` and run `npm run build`.

To design one-off levels by hand: open `tools/level-editor.html` in a browser.
Drag-to-draw arrows. "Export ALL saved" emits JSON for `handcrafted-levels.js`.

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
