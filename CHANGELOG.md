# Changelog

All notable changes to Stray Arrows are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) — added / changed
/ deprecated / removed / fixed / security. Versioning is
[SemVer](https://semver.org).

## [2.1.0] — unreleased

Built on a teardown of Arrows GO! (Meevii/Learnings) and Arrow Puzzle
(Easybrain): same puzzle as ours, but something new every few levels and a
reaction to nearly every action. This release takes the cheapest of those.

### Added
- **Chained level generator** for the classic track, daily and weekly. Field
  study of Arrows GO! on device: almost every step of their solve offers ONE
  tappable arrow; ours offered 2.7–6. With monotone removal there is no
  wrong order, so that count *is* the difficulty. Boards are now built in
  reverse solve order, each new arrow laid across every currently free ray
  (head first, body guided through the rays, hugging placed arrows), then
  re-oriented by the peel. Levels 1–400: ~2.5 tappable per step on normal
  boards, ~3.1 on hard ones, 0 unsolvable, ≤48 ms.
- **HARD levels** — every 3rd level from 5, labelled in the HUD in purple,
  ~1.3× the board and longer arrows: the genre's sawtooth curve. Tutorial
  shortened to levels 1–4 so level 5 can be the first hard one.
- **Lock & key** — from level 31, most boards lock an arrow that is open

  from the start to a key arrow a few waves deep. Tapping a lock costs no
  heart; it pulses the key. Locks are placed so the board stays solvable by
  construction (no key may itself wait on its lock) and re-verified.
- **Boosters unlock by level** — Shield at 12, Reveal at 20, Zap at 35, each
  with a one-time explainer card and a free charge. Players already past a
  threshold before 2.1 keep their boosters without the card.
- **Combo counter** (×3 and up, rising pitch, words at ×5/×8/×12; +1 point
  per combo tap in Rush), **halfway cheer**, and a **win streak** worth
  +2 coins per step (cap +10) that a continue after game over preserves.
- `window._ae.tap/hearts/state/combo/winStreak` QA hooks.

### Changed
- **v3 "Paper & Ink" redesign** — the whole look, rebuilt around the board.
  - Board frame removed; arrows thinner with sharper heads on a flat warm
    paper background (dark: walnut). New palette in both themes.
  - Game HUD: back chevron · "Level N" (purple + HARD on hard levels) ·
    hint, a hairline, then lives and boosters. The star preview and the
    MOVES/TIME/coins strip are gone.
  - Buttons are physical: a solid face on a darker lip that sinks on press.
    Primary = accent face, white label. Prices live on the button (coin +
    amount, or a video glyph for rewarded ads).
  - Menu: one PLAY hero carrying the level number, four icon tiles
    (daily/weekly/zen/rush), a bottom bar (levels/stats/achievements).
  - Win screen: sunburst, verdict (Flawless/Great/Cleared), difficulty,
    time, mistakes, streak, reward pill, then Next / Replay / Home.
  - Game over and rush end: one column of equal-width buttons.
  - Every sub-screen (levels, stats, achievements, settings, skins) shares
    one header: the in-game back chevron, title, coin balance — replacing
    three different back controls. Level tiles scale to the screen width.
  - Sounds synthesised (WebAudio): each arrow plucks the next note of a
    pentatonic scale as a combo climbs; blocked = a falling "tok";
    win = an arpeggio. Five MP3/WAV files removed.
  - Stats rows, achievement names and settings sections localised (ru);
    other languages fall back to their existing translated word where a
    v3 string replaced one, not to English.
- **Level flow: a picture every 5th level, the generator everywhere else.**
  Levels 1–20 (pre-2.0 boards: level 10 was 42×30 with a third of its
  arrows tappable blind) and the dense 21–300 picture block (3× smaller
  than level 20, never ramping back) are now generated.
  `handcrafted-levels.js` shrinks 1.39 → 1.06 MB, 685 → 441 levels.
- Dev server moved to port 8790 (8765 collides with another local project).

### Fixed

- **The procedural generator was running on a dead RNG.** `seededRandom` is
  Park-Miller, valid only for a seed in `[1, m-1]`, but the retry
  perturbation `(baseSeed + 0x9E3779B1*(depth+1))|0` is negative about half
  the time — and JS's `%` keeps the dividend's sign, so one negative seed
  turned the whole stream negative. Every `rng() < p` then read as true and
  every `floor(rng()*n)` index collapsed to 0. Since a retry was the norm,
  most procedural boards were built by a generator that had stopped making
  choices. Seeds are normalised into range now.
- **Levels 301+ were unsolvable ~99% of the time before the fallback.** With
  the RNG repaired, the truth showed: placement builds a solvable board in
  reverse solve order, then the absorption and re-merge passes rewrite heads
  and bodies and break it. Measured at level 301: 167 of 168 attempts
  unsolvable, so every board fell through 30 retries into the
  halved-difficulty escape hatch. Fixed by `_peelOrient` below.
- **Arrows that flew through themselves.** The path test ignores an arrow's
  own cells, and no generator stopped a head from pointing back into its own
  body — 935 arrows in 339 of the 441 shipped picture levels (2.0), and ~5
  per generated board. The peel (runtime and offline) now counts an arrow's
  own cells as blockers, the chained generator rejects such candidates, the
  affected picture levels were re-oriented or regenerated with their shapes
  kept, and `npm run validate` fails on any arrow whose ray re-enters itself.
- Menu background arrows respawned at the pre-v2 brightness and speed
  after their first cycle, undoing the "barely there" pass.
- Daily reward: the claimed tick sat on the day number.
- Rush boards could exceed their own `maxLen` — absorption was bounded only

  as a side effect of the escape-line gate, so a 10×10 board came back as
  seven 20-cell serpents. `maxLen` is enforced directly at every growth site.

### Changed
- **Constructive generation for every board** (`_peelOrient`), the technique
  `tools/gen-shape-levels.js` already used for shape levels: place the cells
  first, then derive each arrow's direction by simulating the solve. An
  arrow's orientation only affects its own removability — flipping it moves
  no cell — so direction is a free variable to spend on difficulty. Where a
  board is genuinely deadlocked (no orientation assignment can finish it, a
  monotone-closure property, so no search can help) the peel drops the arrow
  blocking the most others rather than re-rolling the whole board.
  - arrows tappable on move 1: **29% → 11-14%** (shape levels sit at 10-14%;
    the competitor clone `goarrows` measures 32%)
  - solve depth: 8.8 → 15-17 waves
  - generation time: 660 ms avg / 2150 ms worst → **60 ms / 190 ms**
  - unsolvable boards across a 222-board sweep (procedural, zen, daily,
    weekly, rush, levels to 12000): **0**
- Quality-gate retries drop from 10 to 2 once the peel has run — the peel
  optimises the board it is given, so a re-roll is the same dice again.
- `window._ae.rushBoard()` exposes the rush path for testing; its grid comes
  from a module-level override that no argument can reach.

## [2.0.0] — 2026-07-12 — THE BIG UPDATE

### Added
- **Shape levels** — EVERY level from 21 to 300, then every 5th to 2225
  (665 total), is a generated picture puzzle: hearts, stars, animals,
  food, vehicles and more from **83 hand-drawn masks** — and milestone
  levels (50, 100, 200…) spell their own number in arrows. Generated by
  `tools/gen-shape-levels.js` with solvability guaranteed by construction.
- **Daily login rewards** — 7-day escalating coin cycle with a streak
  calendar; day 4 and day 7 include booster bonuses.
- **Zen mode** — endless, no hearts, pure relaxation.
- **Rush mode** — 75-second time attack on small boards; +5s per cleared
  board, −3s per blocked tap; local best score.
- **Boosters** — Shield (block one mistake), Reveal (show next 3 moves),
  Zap (remove any arrow) — coins or inventory.
- 8 new achievements (login, zen, rush, shape, booster families).
- Premium visual pass: directional screen transitions, board backdrop,
  deeper arrow rendering, shape silhouette reveal, global impact shake,
  exit particle trails, film grain, Poppins display type.
- iOS haptics via `@capacitor/haptics` (previously Android-only vibration).
- Colorblind-safe blocked marker (X glyph, not red-only).
- Pitch-varied whoosh + win arpeggio via Web Audio `playbackRate`.

### Changed
- Procedural difficulty rework: chain-blocker depth scales with level
  (1→3), denser mid-game boards, generation-time quality gate
  (initial-open / unlock-depth bands).

### Removed
- Dead code: unused `_renderGlass` Liquid-Glass renderer, unreachable
  `BAKED_LEVELS` branch, orphaned Rush Hour source data in `tools/data/`.

### Fixed
- CSP `connect-src` now allows `https://itunes.apple.com` — the in-app
  update check was silently blocked by the enforced policy (Codex PR#22).
- Stale manifest colours (`#5c7caa` navy) and missing `icon-192.png`;
  splash screens redrawn in the Sunset Macaron palette.

## [1.0.25] — 2026-07-10

### Changed
- iOS build 37 — version bump carrying the `remove_ads` IAP submission
  through App Store review (first IAP must ship with a binary).

## [1.0.24] — 2026-07-09

### Fixed
- **IAP hardening (3 protections):** grant Remove Ads only on a settled,
  product-matched transaction (pending/foreign transactions no longer
  grant); reclaim entitlement on launch when the store reports not-owned;
  require a store-source marker before trusting the local ads-removed flag.

## [1.0.23] — 2026-07-08

### Fixed
- Completing a level now always unlocks the next one (unlock-next-on-win).

### Changed
- Store listing made honest: removed the false "No ads, no tracking"
  claim; now discloses optional rewarded ads + Remove Ads purchase.

## [1.0.22] — 2026-07-07

### Added
- **Remove Ads IAP** ($2.99 non-consumable) + Restore Purchases in
  Settings (cordova-plugin-purchase v13). Removes interstitials only;
  rewarded ads stay available by choice.
- **Arrow skins + in-app shop** — 10 coin-bought skins: gradients
  (Fire, Ice, Gold, Toxic, Galaxy, Rainbow), render styles (Neon glow,
  Outline, 3D bevel) and Mono Ink.

### Changed
- Bigger default board cells — auto-fit 80%→92% width.

## [1.0.18 – 1.0.21] — 2026-06

### Added
- Full design pass "Sunset Macaron": warm earthy palette (dropped navy),
  redrawn app icon, PLAY hero, animated complete screen, gold sparkle
  confetti, button tap ripple, iOS-HIG grouped Settings.

### Changed
- Denser late-game procedural generation (fixes the "sparse 8001" look).
- Interstitials: disabled (fired every game) → re-enabled with a
  5–7 min wall-clock cooldown, cooldown stamped BEFORE show (1.0.21).

### Fixed
- Pinch/wheel zoom floored at 1.0 — kills the pan dead-zone.

### Removed
- Rush Hour imported levels (1:1 sliding-block lift, didn't feel like our
  game). Level supply: handcrafted + procedural only.

## [1.0.17] — 2026-05-06 — hotfix

Released alongside v1.0.16 to ship the weekly fix as fast as possible.

### Fixed
- **Weekly puzzle was unsolvable for entire weeks.** Procedural retry
  bumped from 5 attempts to 30, perturbation step changed from `+97` to
  `+ 0x9E3779B1 * depth` (Knuth golden-ratio multiplier) so retries
  spread across the seed space instead of walking 97 cells over.
- `index.html` `APP_VERSION` was `v1.0.15` while bundle was `1.0.16` —
  caught by new sync-versions script as a real shipped bug.
- Service worker did not runtime-cache. Sound files / handcrafted-levels
  were missing on first offline launch.

### Added
- High Contrast theme toggle in Settings → Contrast (en + ru localized,
  fallback English for other locales).
- Title screen gradient flow — `STRAY ARROWS` heading cycles
  gold→deepGold→gold every 8 s. Static for `prefers-reduced-motion` users.
- Long-offset shadow on every drawn arrow — Monument-Valley-style depth
  cue without using shadowBlur (free on iOS WebKit).
- ESLint v9 flat config for `tools/` + `sw.js`.
- GitHub Actions CI on every push: lint + npm audit + handcrafted
  validation + version-sync check + build; release workflow on `v*` tag:
  signed AAB + universal APK as Release artifacts.
- `_devWarn` ring buffer in localStorage.ae_errlog (last 20 events).
- `localStorage.ae_admob_test='1'` switches AdMob to test ads on device.
- `npm run regen-assets`, `npm run audit:check`.

### Changed
- Single source of truth for app version is `package.json`
  (`npm version` auto-syncs sw.js, index.html, gradle, iOS pbxproj).
- Hint pulse switched from shadowBlur to layered alpha-fade — same
  visual, ~6× cheaper on iPhone 7 / iOS WebKit.
- Dark-mode button bg `rgba(255,255,255,.08)` → `.14`.
- 18 empty `try/catch` blocks replaced with `_devWarn(stage, err)`.
- Android release builds minified + obfuscated with ProGuard rules
  preserving Capacitor / AdMob / WebView reflection paths.

### Removed
- `@capacitor/assets` from `devDependencies` (source of all 8 `npm audit`
  HIGH severities). Now invoked via `npx` in `npm run regen-assets`.

### Security
- `npm audit` clean. Was 8 high-severity issues prior to v1.0.17.

## [1.0.16] — 2026-05-06

Initial public release.
