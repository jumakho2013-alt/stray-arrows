# Changelog

All notable changes to Stray Arrows are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) — added / changed
/ deprecated / removed / fixed / security. Versioning is
[SemVer](https://semver.org).

## [Unreleased]

### Added
- **2000+ levels** via Rush Hour database import (605 in v2.0.0 alpha; expanding).
- High Contrast theme toggle in Settings → Contrast (en + ru localized,
  fallback English for other locales).
- Title screen gradient flow — `STRAY ARROWS` heading cycles
  gold→deepGold→gold every 8 s. Static for `prefers-reduced-motion` users.
- Long-offset shadow on every drawn arrow — Monument-Valley-style depth
  cue without using shadowBlur (free on iOS WebKit).
- ESLint v9 flat config for `tools/` + `sw.js`.
- GitHub Actions CI on every push: lint + npm audit + handcrafted
  validation + imported-chunk validation + version-sync check + build.
- GitHub Actions release workflow on `v*` tag: signed AAB + universal
  APK uploaded as Release artifacts.
- `_devWarn` ring buffer in localStorage.ae_errlog (last 20 events) —
  surfaces non-fatal failures that previously vanished into empty catches.
- `localStorage.ae_admob_test='1'` switches AdMob to test ads on a real
  device without rebuilding (was hardcoded `false`).
- `npm run regen-assets` (re-renders icons/splashes from `resources/*.svg`),
  `npm run audit:check`, `npm run validate:imported`, `npm run import-rushhour`.

### Changed
- Single source of truth for app version is `package.json`. Running
  `npm version patch|minor|major` (or `npm run build`) auto-syncs
  `sw.js`, `index.html` `APP_VERSION`, `android/app/build.gradle`
  (versionCode + versionName), and iOS `MARKETING_VERSION` +
  `CURRENT_PROJECT_VERSION`.
- Hint pulse switched from shadowBlur to layered alpha-fade — same
  visual, ~6× cheaper on iPhone 7 / iOS WebKit.
- Dark-mode button bg `rgba(255,255,255,.08)` → `.14` for stronger
  contrast against the navy background.
- 18 empty `try/catch` blocks replaced with `_devWarn(stage, err)`.
- Service Worker: precaches `imported-meta.js` + `imported-000.js`,
  runtime-caches successful same-origin GETs (sound files, later
  chunks) so subsequent offline visits have everything.
- Android release builds are now minified + obfuscated
  (`minifyEnabled true`, `shrinkResources true`) with ProGuard rules
  preserving Capacitor / AdMob / WebView reflection paths.

### Fixed
- **Weekly puzzle was unsolvable for entire weeks.** Procedural retry
  bumped from 5 attempts to 30, perturbation step changed from `+97` to
  `+ 0x9E3779B1 * depth` (Knuth golden-ratio multiplier) so retries
  spread across the seed space instead of walking 97 cells over.
- `index.html` `APP_VERSION` was `v1.0.15` while bundle was `1.0.16` —
  caught by new sync-versions script as a real shipped bug.
- Service worker did not runtime-cache. Sound files / handcrafted-levels
  were missing on first offline launch.

### Removed
- `@capacitor/assets` from `devDependencies` (used once every six months
  to regenerate icons; was the source of all 8 `npm audit` HIGH severities
  via `tar`/`minimatch` transitive deps). Now invoked via `npx` in
  `npm run regen-assets` without occupying `node_modules`.

### Security
- `npm audit` clean. Was 8 high-severity issues prior to v1.0.17.

## [1.0.17] — 2026-05-06 — hotfix

Released alongside v1.0.16 to ship the weekly fix as fast as possible.

### Fixed
- Weekly puzzle deadlock (see Unreleased — same patch).

### Added
- All audit-pass changes listed under Unreleased landed here too.

## [1.0.16] — 2026-05-06

Initial public release.
