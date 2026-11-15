# @lily/app

The Lily mobile app for iOS and Android. It is an Expo app with file-based routes (expo-router), NativeWind styling and TanStack Query, and it talks to `@lily/api` over HTTP through a typed client. `package.json` pins the Expo, React Native and Effect versions.

## Run it

The app runs as an Expo dev client, not in Expo Go, because it ships native modules (the plant scanner, Live Activities, the Today widget).

1. Install the monorepo dependencies from the root with `bun install`.
2. Start the API (see `packages/api/README.md`).
3. Create a `.env` file in `packages/app/` with the API origin.

   ```bash
   EXPO_PUBLIC_API_URL=http://localhost:3000
   ```

   Use the origin only, with no `/api/v1`. The Android emulator reaches the host machine at `http://10.0.2.2:3000`.
4. Build and install the dev client, then start Metro.

   ```bash
   bun run --filter=@lily/app ios        # or android
   bun run --filter=@lily/app start      # later runs, with the dev client installed
   ```

The app throws at startup when `EXPO_PUBLIC_API_URL` is missing. The other `EXPO_PUBLIC_*` variables configure Sentry, RevenueCat, Google sign-in and the Expo push project. Store builds and updates read all of them from the EAS environments.

## Commands

Run them from the monorepo root.

| Command | What it does |
| --- | --- |
| `bun run --filter=@lily/app start` | Metro for the installed dev client |
| `bun run --filter=@lily/app ios` | Builds and installs the iOS dev client |
| `bun run --filter=@lily/app android` | Builds and installs the Android dev client |
| `bun run --filter=@lily/app tsc` | Typecheck |
| `bun run --filter=@lily/app test` | Jest. `test:watch` reruns on change |
| `bun run --filter=@lily/app lint` | Biome. `lint:fix` applies the fixes |
| `bun run --filter=@lily/app screenshots` | Store screenshots (see `scripts/screenshots/README.md`) |
| `bun run --filter=@lily/app doctor` | `expo-doctor` |

## In the monorepo

- `@lily/shared` provides the API contract (schemas, `API_PREFIX`) and the domain rules the screens reuse.
- `@lily/plant-scanner` is the iOS scanner of the add-plant flow.
- `@lily/api` serves every request. The app holds no server code. Metro resolves the server-only packages to an empty module.

## Related docs

- [CLAUDE.md](CLAUDE.md) holds the conventions and gotchas for working in this package.
- [CONTEXT.md](CONTEXT.md) defines the app's domain terms.
- [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) describes the tokens and components.
- [scripts/screenshots/README.md](scripts/screenshots/README.md) covers the store screenshot pipeline.
- [docs/agents/releases.md](../../docs/agents/releases.md) covers store builds, OTA updates and versioning.
- [packages/api/README.md](../api/README.md), [packages/shared/README.md](../shared/README.md) and [packages/plant-scanner/README.md](../plant-scanner/README.md) describe the packages the app depends on.
