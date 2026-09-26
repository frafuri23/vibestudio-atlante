## Purpose
Atlante — a personal photo atlas: map, timeline, suggested memory chapters, a places
passport, memory quizzes, and shareable cards, built entirely from the user's
authorized photo library. No account, no backend, no AI API in this release. Full
spec: `docs/IMPLEMENTATION_PLAN.md` (mirrors the user-provided ATLANTE plan). Live
milestone tracking: `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/NATIVE_CAPABILITIES.md`,
`docs/TEST_REPORT.md`.

## Screens & navigation
- `screens/OnboardingScreen.tsx` — "Usa le mie foto" / "Esplora una demo".
- Tabs: `screens/MapScreen.tsx` (Mappa), `screens/MemoriesScreen.tsx` (Ricordi),
  `screens/QuizScreen.tsx` (Gioca). Settings via header icon.
- Pushed: `PhotoDetailScreen`, `NoLocationScreen`, `MemoryDetailScreen`,
  `PassportScreen` (from Ricordi), `QuizResultScreen`, `ShareCardScreen`,
  `SettingsScreen`, `DiagnosticScreen` (internal M0 diagnostic, from Settings).
- Wired in `App.tsx` (native-stack root, bottom-tabs for the three main tabs).

## Data model
`lib/types.ts` — PhotoAsset, PhotoOverride, Place, Visit, MemoryChapter,
IndexJobStatus, QuizQuestion, QuizSessionRecord, QuizQuestionRecord, PrivateZone,
ShareDraftRecord, AppSettingsRecord. Persistence: `lib/db/repository.ts` — real
SQLite on native (`lib/db/nativeSqlite.ts`), AsyncStorage-backed fallback with the
same contract on web (`lib/db/webFallback.ts`) — see docs/DECISIONS.md for why.
Full plan §3 schema now implemented: photo_overrides, places, memories +
memory_photos, visits + visit_photos, photo_assets (metadata-only scan cache,
read on restart — no auto gallery access), quiz_sessions + quiz_questions
(resumable), private_zones (managed from Settings), share_drafts, app_settings,
index_jobs.

## Features (status)
- Onboarding, demo/real mode split — implemented, demo path smoke-tested visually.
- Progressive indexing state machine (`lib/indexing/coordinator.ts`) — implemented,
  with persisted cursor checkpoints, resume after an interrupted scan, demo/real
  checkpoint isolation and id deduplication; still unverified on a real device
  library (see docs/NATIVE_CAPABILITIES.md).
- Location reading hardening (2nd pass, after the symptom was reported again on
  TestFlight) — `lib/photoLibrary/nativeAdapter.ts` + new pure module
  `lib/photoLibrary/locationExtraction.ts`: first `getAssetInfoAsync` pass now uses
  `shouldDownloadFromNetwork: false` (the library default `true` makes every asset
  try to pull its original from iCloud — the scan then crawls/times out and every
  failure looked like "no location"), 8s per-asset timeout, EXIF GPS fallback
  (iOS `{GPS}` dict + Android flat keys, hemisphere refs applied, 0/0 rejected),
  bounded network retry (12 per page) only for `isNetworkAsset` assets, real
  `cloudAvailability`, and `metadataStatus: "unavailable"` surfaced in the UI so
  "no GPS" is no longer conflated with "metadata unreadable right now".
  `LOCATION_PIPELINE_VERSION` (lib/storage.ts, v2) marks the cache written by the
  old pipeline as untrustworthy: the Map shows an explicit "Posizioni da
  ricontrollare" + rescan button (never an automatic gallery read).
  Still unverified on a real device library.
- Per-asset GPS location read (`lib/photoLibrary/nativeAdapter.ts`) — implemented
  this turn: `MediaLibrary.getAssetsAsync` never returns coordinates, so the
  adapter now calls `getAssetInfoAsync` per asset (max 6 concurrent) for every
  scanned page to populate real `latitude`/`longitude`. Previously every photo was
  reported as having no location regardless of its real metadata — this was the
  root cause of the TestFlight report "tutte le foto risultano senza posizione".
  A photo genuinely lacking GPS (screenshot, location off) still correctly reports
  none; a per-asset read failure (e.g. an undownloaded iCloud asset) marks only
  that photo `metadataStatus: "unavailable"` without failing the rest of the scan.
  Unverified on a real device library — see docs/NATIVE_CAPABILITIES.md.
- Map with clustering + year filter + web list fallback — implemented on demo data.
- Marker tap (2026-09-29, JS-only): like Apple Photos, a tap NEVER zooms — it opens
  `PlaceSheet` with every photo grouped at the current zoom (groups >3 open straight
  on the grid). Multi-city groups get a combined title (`groupTitle` in
  `lib/geo/cityIndex.ts`: "Roma e Oslo" / "Roma, Oslo e altri N"), "N città in M
  paesi" meta, and per-city filter chips (exact split up to 3000 photos).
  `zoomRegionFor` is no longer used by the map.
- Suggested memories engine (`lib/memories/engine.ts`), deterministic — implemented.
- Passport, quiz (place + year modes, seeded scoring) — implemented on demo data.
- Share cards (`lib/share/sanitizer.ts` + `ShareCardScreen`) — implemented; real
  file capture/share only works on native build (`react-native-view-shot` +
  `expo-sharing`).
- M6 accessibility hardening — implemented in code: 44pt minimum for the interactive
  controls identified by audit, VoiceOver labels/hints/states on primary flows, and
  `lib/useReduceMotion.ts` combining the saved override with the OS preference. Settings
  exposes an explicit Sistema/Attivo/Disattivo selector, so following the OS remains
  selectable. `components/FocusablePressable.tsx` adds a visible web keyboard-focus ring
  and is used across the tab roots, onboarding and settings. The onboarding and
  quiz-result animations resolve immediately when motion is reduced. VoiceOver, Dynamic
  Type and contrast remain unverified on a physical iPhone.
- Gioca redesign (2026-09-27) — JS-only (uses modules already in the pending build):
  photo-backed mode cards with real eligible counts and disabled reasons
  (`components/QuizModeCard.tsx`), segmented outcome progress
  (`components/QuizProgress.tsx`), exit button that keeps the session resumable,
  2x2 year grid with right/wrong colours, feedback card with gained points.
  Place mode uses `components/GuessMap.tsx`: tap places a pin, "Conferma posizione"
  scores it, then guess + real location + dashed line are framed (Apple Maps on
  native; svg chart with city labels + inverse projection on web). This REPLACES the
  old web "Prova risposta (demo web)" button that always answered Roma (a simulated
  answer, against the plan's constraint). Place score scale 25 → 150 km
  (`PLACE_QUIZ_SCALE_KM`), "correct" = ≥500 points. Resume now skips answered
  questions (questionIndex saved as index+1, first unanswered record wins) and keeps
  the original createdAt. Manual override coordinates are used as the answer when
  the photo has no GPS.
- Large-library performance (2026-09-28) — JS-only, unverified on device: viewport-culled
  clustering capped at 250 markers + one-time newest-first sort (`lib/geo/cluster.ts`,
  `AppMap`), throttled photo emission during scans (`photoEmitIntervalMs`, 1.5 s),
  generation-based prune at scan end (`Repository.pruneStalePhotoAssets`), SQLite WAL +
  prepared statements + one-transaction `Repository.replaceSuggestions` for memories and
  visits, Intl-free month names, Set/Map lookups. Benchmark 1k/10k/50k on synthetic
  in-memory photos in Diagnostica (`lib/perf/benchmark.ts`). Rule: never spread large
  arrays into Math.min/max.
- Apple Liquid Glass (added, needs a NEW native build: adds expo-glass-effect) —
  `components/Glass.tsx` exports `LIQUID` (iOS 26 + API available, computed once) and
  `Glass`; `GlassFill` renders a real `GlassView` (no tint overlay) when LIQUID, else the
  blur+tint fallback (preview/web/Android/iOS<26). Tab bar is now a floating glass
  capsule (`tabBarBottomGap` in lib/useTabBarHeight.ts; useTabBarHeight = 56 + gap + 8).
  Glass also on: map title card, year chips (inactive), info pill, no-location pill,
  zoom controls, PlaceSheet (floating, inset 8pt). Rule: no opacity<1 on a parent of
  glass — press feedback uses scale.
- Glass tab bar (M6 polish) — implemented, needs a NEW native build (adds expo-blur):
  `components/GlassFill.tsx` (BlurView system chrome material on iOS + theme tint,
  stronger tint on web/Android), tab bar `position: absolute` with GlassFill background,
  also used by the map title card, zoom controls and "senza posizione" pill. Tab screens
  pad their bottom with `lib/useTabBarHeight.ts` (reads React Navigation's
  always TAB_BAR_BASE 56pt + bottom inset; the bar itself is the custom
  `components/GlassTabBar.tsx` passed as `tabBar` in App.tsx, drawn at exactly that
  height so each tab button is ≥44pt in every runtime — the stock bar ignored
  tabBarStyle.height in the web preview and stayed at 41pt) — NEVER import
  `useBottomTabBarHeight` directly: the web preview doesn't export it and it crashed
  MapScreen. PlaceSheet takes `bottomOffset` to rest on top of the bar.
- Photo loading polish (M6) — JS-only: `components/PhotoImage.tsx` is the single photo
  slot (grids, covers, quiz, detail): a skeleton of the final size with ONE shared
  pulse loop for all tiles (static when Reduce Motion), and an explicit
  "Foto non disponibile" state on load error (e.g. iCloud original not downloaded) —
  never an endless grey box. PhotoDetail keeps the photo's real ratio (clamped
  0.75–2.2), shows Italian labels for type/availability and a note when
  metadataStatus is "unavailable". Tab bar has no extra vertical padding so each tab
  button gets the full TAB_BAR_BASE (≥44pt).
- M7 (link challenges) / M8 (collaborative chapters) — not started, out of scope
  for this session per the plan's own sequencing rule.
- Scan resume after restart/OTA (2026-09-23) — implemented: `commitScanPage` (page rows +
  cursor in one transaction), `startGeneration` on index_jobs, persisted "scanning" at boot
  shown as "paused" and auto-continued (interrupted user-started scan only, permission
  granted), unchanged assets reuse cached GPS, map keeps previous results during a rescan,
  `components/ScanProgressCard.tsx` (Pausa / Riprendi) on the Map. Unverified on device.
- iOS background scan continuation (2026-09-24) — implemented, needs a NEW native
  build: `lib/indexing/backgroundScan.ts` (expo-background-fetch task defined in App.tsx,
  20 s slices of 25-photo pages, only continues a user-started scan still in phase
  "scanning" with permission granted), `lib/indexing/scanLock.ts` (foreground/background
  never overlap), coordinator option `shouldYield`, `lib/memories/refresh.ts` shared
  memory recompute, foreground sync on return to active, background availability shown
  in ScanProgressCard. Unverified on device.
- Scan checkpoint hardening — implemented: startup adopts only the checkpoint for
  the active mode; legacy web records are normalized; starting a new scan cancels
  the previous coordinator; the GPS pipeline version is advanced only after a real
  scan completes successfully. Errors, cancellation, timeouts and unavailable
  adapters preserve the checkpoint and stale-location warning.

- Design + functions pass (2026-09-25) — needs a NEW native build (react-native-svg,
  expo-linear-gradient, expo-haptics): full-bleed map `components/AppMap.tsx` (native
  MapView with photo-thumbnail markers, zoom-dependent screen-space clustering in
  `lib/geo/cluster.ts`, antimeridian-safe fit; web = svg chart with graticule + city
  labels, same markers, drag pan, zoom buttons), `components/PlaceSheet.tsx` bottom
  sheet listing ALL photos of a place, offline place names `lib/geo/cityIndex.ts`
  (nearest city within 45 km, no network/permission) used in memory titles
  (engine algorithmVersion 2, old chapters recomputed from cache at boot), Passport,
  Timeline and share card; Ricordi has Capitoli/Timeline segments
  (`components/TimelineView.tsx`, virtualized month rows); MemoryDetail hero + share
  button → travel card (was unreachable before); dismissed memories hidden; demo
  photos are generated images matching their places; `lib/haptics.ts`.
- Follow-up (2026-09-26): `clusterForRegion` now greedy distance-based (Chebyshev,
  spatial hash) + final overlap-merge pass — markers can no longer overlap (grid
  cells left adjacent clusters stacked). Year chips, Capitoli/Timeline segment and
  tab items at 44pt. Onboarding switches to two columns at width >= 900 and a smaller
  collage on short screens so both CTAs stay above the fold. Verified in preview:
  demo → Map → Ricordi → Timeline (months + city names) → relaunch keeps data.

## Decisions (dated)
See `docs/DECISIONS.md` — key one: dual storage/photo-library adapters (native vs.
web fallback) because native modules don't execute in StackSail's react-native-web
preview/website.
- See `docs/DECISIONS.md`, entry "Sessione successiva — fix build nativa fallita +
  foto segnalate senza posizione" for full detail on two fixes made this session:
  pinning all native dependencies in `package.json` (was `"latest"` for
  `expo-media-library`, `expo-sqlite`, `react-native-maps`, `expo-image`,
  `expo-sharing`, `react-native-view-shot`, `react-native-screens`,
  `react-native-safe-area-context`, `@react-native-async-storage/async-storage`,
  navigation packages) to the exact versions compatible with Expo SDK 52 / RN
  0.76.5 plus adding the missing `expo-media-library` config plugin to
  `app.json`; and fixing `NativePhotoLibraryAdapter.getPage` to actually fetch
  per-asset GPS via `getAssetInfoAsync` (see Features above) instead of always
  returning `latitude: null, longitude: null`.
- Web preview boot hardening (this session): `lib/appState.tsx`'s startup effect was an
  unprotected async IIFE — a single storage/repository/permission call that rejected or
  never settled left `ready === false` forever, i.e. an endless spinner that the preview
  reports as "didn't load". Now every startup step goes through `bootStep()` (4s timeout
  + error capture + safe fallback), the whole effect has `try/catch/finally` so
  `setReady(true)` always runs, and a degraded start shows a visible `bootError` banner
  (`AppShell` in App.tsx, rendered outside NavigationContainer) instead of blocking.
  Also: on web, "real" mode now uses `lib/photoLibrary/webUnavailableAdapter.ts`
  (no native imports at all) instead of lazily requiring the expo-media-library adapter
  during boot. Onboarding column is centred/capped at >=700pt for the universal target.
- Web/demo dead-end fix (this session): verified with a live preview run that the app
  DOES boot on web (onboarding renders). The remaining "su web non va" was after that
  point: (a) `runScan` returned silently when `repoRef` was still null (slow/failed
  storage init) so the map stayed empty with no explanation — now `ensureRepository()`
  retries `getRepository()` and, if it still fails, the Map shows an explicit error
  strip with "Riprova" instead of nothing; (b) demo mode opened empty when nothing was
  cached — the boot now auto-runs the DEMO scan only (synthetic fixtures, never the
  gallery, so the "no automatic gallery access" constraint holds); (c) choosing "Usa le
  mie foto" on web persisted `mode: "real"`, where the photo library cannot exist, and
  every later load landed on a permanently empty map — the `unavailable_in_preview`
  banner now offers "Prova la demo" as an explicit way out.
- Known non-blocking preview warning: a few tappable elements report under the
  44pt touch-target guideline in the live preview digest — not yet triaged/fixed;
  revisit if the user asks about tap-target sizing specifically.

- Apple-style restyle + full dark mode (this session, no feature change):
  `lib/theme.ts` now exports TWO palettes with identical keys (`lightColors` /
  `darkColors`, type `Palette`) plus an iOS type ramp (largeTitle 34 → tabLabel 11,
  SF/system `fontFamily`), `hairline`, and per-scheme `shadows` (dark mode elevates
  with a lighter SURFACE, since shadows are invisible on black). `lib/themeContext.tsx`
  provides `ThemeProvider`/`useTheme` with a persisted `system|light|dark` preference
  (AsyncStorage `atlante.themePreference`, default = follow iOS), switchable in
  Impostazioni → Aspetto. Every screen builds its styles via a memoized
  `makeStyles(colors)`; no screen imports a static colour any more. Cards lost their
  1px borders in favour of surface+shadow, with hairline separators inside iOS-style
  grouped lists. Pushed screens use the native nav bar (`headerLargeTitle` on iOS for
  Impostazioni/Diagnostica/Passaporto/Senza posizione) and their duplicated in-screen
  titles + double top insets were removed. New `components/ScreenHeader.tsx` (custom
  large title for the three tab roots) and `components/SettingsButton.tsx` — the
  latter fixes a real bug: Settings was unreachable, because its button lived in the
  tab navigator's `headerRight` while all three tabs set `headerShown: false`. No new
  native dependency was added (no expo-blur/haptics/linear-gradient) to avoid
  jeopardising the just-repaired native build; motion uses core `Animated` only.
  Sub-44pt tap targets (year chips, inline actions, zone delete) are fixed.

- OTA update failure — invalid npm package name (this turn): pushing an instant
  update failed in the dependency-install step with
  `npm error EINVALIDPACKAGENAME … "the app npm error * never loads"`.
  Root cause: the pipeline's dependency scanner extracts import specifiers with a
  TEXT match on `from "…"` that also matches inside COMMENTS and ACROSS line
  breaks. `lib/appState.tsx` had a block comment ending
  `… indistinguishable from "the app` / ` * never loads". */`, so the scanner read
  `the app\n * never loads` as a package name and npm rejected it. `package.json`
  was and remains correct (all native deps pinned to the Expo SDK 52 set).
  Fix: reworded that comment (plus a preventive reword in
  `lib/photoLibrary/webUnavailableAdapter.ts`, whose comment quoted
  `require("./nativeAdapter")` and a line-wrapped `… from` +
  `"expo-media-library"`), and verified by project-wide regex that no comment
  still contains a `from "…"` / `import … "…"` / `require(…)` sequence.
  RULE for future edits: never write the word "from" (or `require(`) immediately
  before a quoted string inside a comment — it will be parsed as a dependency and
  break OTA/native installs.

- SQLite schema migration on existing installs (2026-09-24): the real reason the scan
  restarted from zero on TestFlight after a relaunch/OTA. `CREATE TABLE IF NOT EXISTS`
  never adds columns, and `photo_assets` had NO column migration, so on installs created
  before `scan_generation`/`metadata_status` existed the schema batch failed at the
  `scan_generation` index, `init()` threw, and nothing (pages, cursor) was ever saved.
  Fix: `NativeSqliteRepository.migrateColumns()` (PRAGMA table_info + ALTER ADD COLUMN,
  idempotent) for photo_assets, index_jobs, memories, app_settings, private_zones;
  indices created only after migration, each non-fatal. `getRepository()` now caches the
  instance only after a successful init and shares one in-flight attempt.
  RULE: every new column MUST be added to the matching `migrateColumns` list, and
  every index goes in the non-fatal post-migration loop, never in the CREATE TABLE batch.

- 2026-09-29 — Docs realigned (STATUS rewritten); device test list in
  `docs/IPHONE_TEST_CHECKLIST.md`, results go in TEST_REPORT "Prove su dispositivo".
  ShareCard no longer claims "Condiviso": iOS expo-sharing resolves on dismiss without
  telling send vs cancel. Diagnostic map step is never "ok" (visual check only).

## User preferences
Italian UI copy throughout, matching the user's own spec language.
Visual direction: Apple/iOS conventions (grouped surfaces, SF type ramp, no outlined
boxes, restrained motion). Dark mode must stay a first-class, complete theme.
Checkpoint/resume behavior must be honest: no automatic gallery access on startup,
no claim of background scanning, and no stale GPS cache marked current after a
partial scan. Interactive controls should remain at least 44pt; motion must respect
both Atlante's saved override and the operating-system accessibility preference.
