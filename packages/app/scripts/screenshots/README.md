# Store screenshot pipeline

Builds the App Store and Google Play screenshots in English and French. `run.ts` runs two stages for each platform and locale.

1. **Capture.** Maestro runs `.maestro/capture.yaml` on the booted simulator or emulator. The flow logs in as the demo account, switches the app language in Settings, reaches each screen by deep link or by tapping through from the plants grid, and saves a raw PNG to `screenshots/sources/<platform>/<locale>`.
2. **Compose.** `compose.ts` draws the background, the headline from `copy.ts` and a phone frame around each capture, and writes the store PNG to `screenshots/output/<platform>/<locale>`. The iOS canvas is 1284 by 2778, and the Android canvas is 1080 by 1920.

Both output folders sit under `packages/app` and are gitignored.

## Before you run it

- **Maestro CLI.** Install it with `curl -Ls "https://get.maestro.mobile.dev" | bash`.
- **Phone frame.** Compose reads `mockup.png` from the `app-store-screenshots` skill in `.agents/` at the monorepo root. `.agents/` is gitignored, so restore that skill from `skills-lock.json` first. Without it, compose exits with `Compose failed for <phone-frame>`.
- **Demo data.** Run `bun run --filter=@lily/db seed:demo` once. Before each capture, `run.ts` runs `seed:demo-chat` in the capture's locale, so the chat screenshot shows bubbles in that language. `DEMO_EMAIL` in `.maestro/capture.yaml` must be the account that `seed:demo` creates.
- **API.** Run it with `DISABLE_MAGIC_LINK_VERIFICATION=true`. `packages/api/src/services/auth/endpoints/send-magic-link.ts` then returns an instant code, and the app signs in with no email step. Without the flag the flow stops on the check-email screen.
- **iOS.** Boot a large iPhone simulator, such as a Pro Max, with a dev or release build installed. Compose scales each capture into the phone frame, so a smaller capture comes out soft.
- **Android.** Boot an arm64 phone AVD (`adb shell getprop ro.product.cpu.abi` prints `arm64-v8a`). An x86 image under Rosetta is slow enough to trigger ANRs. Install a release build, because a dev bundle is too slow on the emulator's JS thread and also ANRs during navigation.
- **Metro.** Keep it running for a dev build. The flow opens the dev client on `METRO_URL`, which defaults to `http://localhost:8081` on iOS and `http://10.0.2.2:8081` on Android. Export `METRO_URL` to point at another host or port.

## Run

From the monorepo root:

| Command | What it does |
| --- | --- |
| `bun run --filter=@lily/app screenshots` | Captures and composes both platforms and both locales |
| `bun run --filter=@lily/app screenshots:ios` | iOS only |
| `bun run --filter=@lily/app screenshots:android` | Android only |
| `bun run --filter=@lily/app screenshots:compose` | Composes the existing captures again, with no capture, to iterate on layout or copy |

`run.ts` also takes `--en` or `--fr` for one locale, and `--no-compose` to capture only. Pass them to `bun packages/app/scripts/screenshots/run.ts`.

## Change the screenshots

- **Headlines.** Edit `copy.ts`.
- **Layout.** Edit `layoutFor()` in `compose.ts`, which sets the phone width, the headline position and the font sizes.
- **Screens.** Add the name to `SCREENS` in `copy.ts`, then add a step to `.maestro/capture.yaml` that opens the screen and saves `${OUTPUT_DIR}/<name>`. The flow finds the app's screens by `testID`, so give the new screen's root a `testID` and wait for it before the screenshot. `scripts/screenshots/__tests__/flow-check.test.ts` runs with the app tests and needs no device. It fails when the flow opens a `lily:///` link with no route file under `app/`, waits for a `testID` that no component sets, saves a screenshot whose name is not in `SCREENS`, or leaves a `SCREENS` entry with no screenshot step.

## Troubleshooting

- **"iOS driver not ready in time".** Maestro compiles and installs its XCTest runner on the first run against a simulator. `run.ts` raises `MAESTRO_DRIVER_STARTUP_TIMEOUT` to 360000 ms. Export a higher value on a slow machine. Later runs reuse the runner.
- **The dev client shows its server picker.** Metro is not reachable at `METRO_URL`.
- **A wait for a `testID` times out.** The screen changed. Find the `testID` the flow waits for in the app code, and update the flow or the screen. A deleted route or `testID` also fails `flow-check.test.ts`. A `testID` that still exists on another screen passes that test, so only a capture run proves the wait.
- **Login stalls.** The API is not running, or `DISABLE_MAGIC_LINK_VERIFICATION` is unset.
- **Compose skips a screen.** Its capture is missing from the sources folder, so run the capture again for that platform and locale.
