# Store screenshot pipeline

Generates App Store (6.9" / 1290×2796) and Google Play (phone / 1080×1920)
marketing screenshots for Lily, localized en + fr.

Three stages:

1. **Seed** — `bun --cwd packages/db run seed:demo` creates user
   `antoine@lily.app` (Alex) with 12 plants, overdue care, history.
2. **Capture** — Maestro drives the simulator, logs Alex in via the
   `DISABLE_MAGIC_LINK_VERIFICATION` instant-code path, and writes raw
   screenshots to `screenshots/sources/{platform}/{locale}/`.
3. **Compose** — `compose.ts` overlays a Lily-branded gradient + Space
   Grotesk headline + rounded phone frame onto each source, writing
   store-spec PNGs to `screenshots/output/{platform}/{locale}/`.

## Prerequisites

- **Maestro CLI** —
  `curl -Ls "https://get.maestro.mobile.dev" | bash`
- **iOS Simulator** — an iPhone 16 or 17 Pro Max booted. 17 Pro Max
  captures at 1320×2868 (pipeline's target), 16 Pro Max at 1290×2796
  (dropped in via `fit: 'cover'` — invisible mismatch).
- **Android Emulator** — an **arm64** phone-size AVD booted. Verify
  with `adb shell getprop ro.product.cpu.abi` — must print
  `arm64-v8a` (x86 emulators under Rosetta on Apple Silicon are 3-5×
  slower and will ANR).
- **Builds installed on each device, built with `EXPO_PUBLIC_E2E=1`:**

  - **iOS: dev build OR release** — dev build is fine (Metro + fast
    iteration works). Release build also works if you want to avoid
    Metro dependency.
  - **Android: release build REQUIRED.** Dev-mode Android bundles are
    too slow on the emulator's JS thread — trigger ANRs during
    navigation. Hermes-compiled release APK loads near-instantly.

  ```bash
  # iOS (dev is fine)
  EXPO_PUBLIC_E2E=1 bun --cwd packages/app run ios

  # Android (MUST be release — dev build will ANR)
  EXPO_PUBLIC_E2E=1 bunx expo run:android --cwd packages/app --variant=release
  ```

  Why the `EXPO_PUBLIC_E2E` env var: `@callstack/liquid-glass` on
  iOS 26+ creates an accessibility container around the tab bar that
  hides the rest of the app's hierarchy from XCTest / Maestro.
  `LiquidGlassTabBar` reads this env var at build time and falls back
  to the plain `BottomTabBar` when set — restoring a traversable
  a11y tree. Android doesn't use liquid glass, but the env var is
  free insurance.

  Don't ship these builds to production — the screenshots will miss
  the liquid-glass tab bar (~3% of the frame). For actual App Store
  submission, rebuild without the env var.
- **Metro bundler running** on `http://localhost:8081` (default Expo
  start). Set `METRO_URL` in your shell if it's on a different port or
  a LAN IP:

  ```bash
  export METRO_URL=http://192.168.1.20:8081
  ```
- **API running** with `DISABLE_MAGIC_LINK_VERIFICATION=true`. Without
  this the flow stalls on the check-email screen.

## Run

From the monorepo root:

```bash
# Seed demo data
bun --cwd packages/db run seed:demo

# Capture + compose everything (iOS + Android, en + fr)
bun --cwd packages/app run screenshots

# Subsets
bun --cwd packages/app run screenshots:ios
bun --cwd packages/app run screenshots:android

# Skip capture, re-run compose only (fast iteration on layout/copy)
bun --cwd packages/app run screenshots:compose
```

Outputs land in `packages/app/screenshots/output/{ios,android}/{en,fr}/*.png`.

## How the locale override works

`LocalizationContext` listens for deep links in `__DEV__`. Maestro sends
`lily://?e2e_locale=fr` at the start of each flow; the context reads the
query param and calls `setLanguage`. No rebuild, no native bridge.

## How auth bypasses email

`api/src/services/auth/endpoints/send-magic-link.ts` returns an
`instantCode` field when `DISABLE_MAGIC_LINK_VERIFICATION` is set.
`AuthContext.login()` detects it and auto-verifies. Works for any email
when the flag is on — we reuse the demo user from `seed-demo-data.ts`.

## Customizing

- **Headlines** — edit `copy.ts`.
- **Layout** — tweak `layoutFor()` in `compose.ts` (phone width %,
  headline Y offset, font size).
- **Screens** — add to `SCREENS` in `copy.ts` and extend `capture.yaml`.

## Troubleshooting

- **"iOS driver not ready in time"** — Maestro is compiling + sideloading
  its XCTest runner into the simulator (one-off per sim state, 60–120s).
  The orchestrator raises `MAESTRO_DRIVER_STARTUP_TIMEOUT` to 180s by
  default. If your machine is slower, export a higher value before
  running:

  ```bash
  export MAESTRO_DRIVER_STARTUP_TIMEOUT=300000   # 5 minutes
  ```

  Second run will be instant — the runner is cached in the simulator.
- **Dev client server-picker screen appears** — `clearState` wipes the
  dev client's remembered Metro URL. The flow sends a
  `lily://expo-development-client/?url=${METRO_URL}` deep link right
  after launch to auto-load the bundle. If you see the picker anyway,
  confirm Metro is running at `METRO_URL` (default
  `http://localhost:8081`).
- **"element not found: My Plants"** — the deep-link locale override
  didn't fire. Check that the dev build was installed recently enough
  to include `LocalizationContext` with the Linking hook.
- **Login stalls** — the API isn't running, or
  `DISABLE_MAGIC_LINK_VERIFICATION` is not set.
- **Blank phone frame** — source PNG is missing. Re-run capture or
  check `screenshots/sources/` to confirm Maestro wrote it.
- **Soft / pixelated output** — the simulator isn't the expected size.
  iOS source must be 1290×2796; Android emulator should be 1080px wide.
