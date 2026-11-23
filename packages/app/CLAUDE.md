# packages/app

The Lily mobile app for iOS and Android, built with Expo, expo-router, NativeWind and TanStack Query. Metro bundles it in development. EAS builds the store binaries and publishes the over-the-air updates. It is not a Node runtime. `metro.config.js` resolves every package in `nodeOnlyPackages` (`@lily/db`, `@effect/sql-pg`, `fs` and the rest) to an empty module, so an import from them type-checks and holds nothing at runtime. The app reaches the API only through the typed client in `src/utils/client.tsx`.

## Commands

Run every command from the monorepo root.

| Command | What it does |
|---|---|
| `bun run --filter=@lily/app start` | Starts Metro for an installed dev client |
| `bun run --filter=@lily/app ios` | Builds the native iOS project, installs the dev client on a simulator and starts Metro |
| `bun run --filter=@lily/app android` | The same for Android |
| `bun run --filter=@lily/app tsc` | Typecheck |
| `bun run --filter=@lily/app test` | Jest with `jest.config.js`. Plain `bun test` runs Bun's own runner, which skips that config and its mocks |
| `bun run --filter=@lily/app lint` | Biome. `lint:fix` writes the fixes |
| `bun run --filter=@lily/app screenshots` | Captures and composes the store screenshots. See `scripts/screenshots/README.md` |
| `bun run --filter=@lily/app mascot:encode [source-dir]` | Re-encodes the mascot clips from `source-dir` (default `~/Downloads`) into `assets/mascot/` |
| `bun run --filter=@lily/app doctor` | Runs `expo-doctor` |

Set `EXPO_PUBLIC_DEV_API_LATENCY_MS=1500` before `start` to delay every API call by that many milliseconds in development. Use it to check loading states.

## Layout

- `app/` holds the expo-router routes. A route file re-exports a screen from `src/screens/<name>/`, as `app/(app)/(tabs)/care.tsx` does. A few routes hold their own code, such as `app/(app)/tip.tsx` and the sign-in routes in `(auth)`. The `welcome` and `onboarding` routes in `(auth)` re-export screens. `app/index.tsx` is the gate that redirects on auth, welcome, onboarding and a pending canopy invite.
- `src/screens/<name>/` holds one screen and the components only it uses. A component two screens share goes in `src/components/`, and the base controls (`Button`, `IconButton`, `Input`, `TextLink`) live in `src/components/ui/`.
- `src/utils/client.tsx` is the typed API client and the `useEffectQuery` and `useEffectMutation` hooks. `src/utils/query-keys.ts` builds the query keys. `src/utils/plant-cache.ts` holds the exact keys and cache updates for optimistic plant writes.
- `tailwind.config.js` holds the color, radius, shadow and font tokens. `src/theme/index.ts` holds the same colors as hex (`iconColorsLight`, `iconColorsDark`) for props that take a color, and the font names. `DESIGN_SYSTEM.md` describes the components built on them.
- `src/i18n/locales/en/` and `src/i18n/locales/fr/` hold one file per namespace.
- `src/__tests__/setup.ts` and `src/__tests__/mocks/` are the Jest setup.
- `modules/expo-live-activity-lily/` is the local Expo module for Live Activities and the Today widget snapshot. `templates/LilyWidgetsExtension/` is the Swift source of the widget extension. `plugins/withLiveActivity/app.plugin.js` adds the extension target at prebuild and copies the template into the generated `ios` project. Edit the template, because every prebuild overwrites the copy.
- `src/widgets/today/` encodes the Today widget snapshot.
- `scripts/screenshots/` and `.maestro/capture.yaml` are the store screenshot pipeline.
- `assets/mascot/` holds the mascot clips as stacked MP4s, with the color frame on top and the alpha mask below, so no platform needs an alpha video codec. `src/components/Mascot.tsx` plays the same file on iOS and Android and draws the lower half as a Skia luminance mask over the upper half. `src/assets/mascot.ts` registers each clip. `scripts/mascot/encode.ts` builds the clips from the exported `lily-<clip>-android.mp4` files, and `scripts/mascot/key.ts` adds the particles (rain, confetti) that the exported mask leaves out.

## Rules

Imports inside this package use the `@/` alias (see `CODING_STANDARDS.md`).

### Styling

- **Style with `className`.** NativeWind compiles the Tailwind classes, so static styles go in `className`. Use `style` only for values known at runtime (a measured height, a safe-area inset), Reanimated animated styles, and native props that have no class (the shadow and Android `elevation` of the elevated card in `src/components/Card.tsx`).
- **Colors come from tokens.** Use the color classes from `tailwind.config.js` and pair each one with its `dark:` class (`bg-white dark:bg-surface-dark`). Dark mode is class-based. A prop that takes a color (an icon, `placeholderTextColor`, a loader) reads `useIconColors()` from `src/hooks/useIconColors.ts`, which returns the light or dark set from `src/theme/index.ts`.
- **The radius and shadow scales are custom.** `rounded-xl` is 24px, not Tailwind's 12px, and `rounded-2xl` is 32px. Read `borderRadius` and `boxShadow` in `tailwind.config.js` before you pick one. Spacing and font sizes are Tailwind's defaults.
- **Set fonts with the `font-*` classes.** `font-regular`, `font-medium`, `font-semibold` and `font-bold` map to the Space Grotesk faces, and `font-extrabold` maps to the bold face. A `style` that needs a family reads `fonts` from `src/theme/index.ts`. The comment there that calls the style prop required is stale, as `text-base font-semibold` in `src/components/ui/Button.tsx` shows.
- **Variants map to class strings.** A component with variants maps each one to its class strings with `Match.value` and `Match.exhaustive`, as `getVariantStyles` in `src/components/ui/Button.tsx` does. A variant added to the union then fails `tsc` until the mapping handles it.

### Data

- **Queries never throw.** `useEffectQuery` has the error type `never`. Its `data` is the unwrapped response, `undefined` on a failure, and `result` holds the raw `Result`. An error state reads `apiError` and `isApiError` in place of `error`. `useEffectMutation` throws the `ApiFailure`, so mutations use the usual `error` and `onError`.
- **Query keys come from `src/utils/query-keys.ts`.** `queryKeys` holds the prefixes that `invalidateQueries` and the other filter methods take. `effectQueryKey` builds the exact key `useEffectQuery` stores a query under, and it carries the cached `ApiResult<T>`, so `getQueryData` and `setQueryData` take that key with no type argument and the compiler checks what an optimistic write puts in the cache. `lint/query-key-from-factory.grit` rejects a hand-written key and `lint/exact-query-key.grit` rejects a prefix or a type argument in an exact read or write.
- **A 401 refreshes once.** The client refreshes the access token on a 401 and replays the request once. When the server rejects the refresh, the client logs the user out (`trackForcedLogout`). A raw `fetch`, such as the streaming chat, wraps its fetch in `withAuthRefresh` from `src/utils/auth-fetch.ts`, which also refreshes and replays once. When that refresh fails it returns the original 401 and does not log the user out. A rejected refresh still deletes the stored tokens.
- **`EXPO_PUBLIC_API_URL` is the API origin.** It carries no `/api/v1` and no trailing slash, because the client adds `API_PREFIX` from `@lily/shared`. A raw URL is `${API_BASE_URL}${API_PREFIX}/<path>`. The app throws at startup when the variable is missing. Locally it comes from a `.env` file next to `package.json`. Store builds and updates read it from the EAS environments.
- **SecureStore writes pass `KEYCHAIN_OPTIONS`.** Every `setItemAsync` passes `KEYCHAIN_OPTIONS` from `src/utils/storage.ts`, the after-first-unlock keychain class. iOS launches the app in the background while the phone is locked, for a Live Activity push or a notification. Under the default when-unlocked class the token read throws there, and the startup check reads that as signed out. Rewriting an item moves it to the new class.

### Platform

- **Tab bar.** `app/(app)/(tabs)/_layout.tsx` uses the native tabs. Under Liquid Glass the Care tab badge is a dot, because the native tabs re-apply the bar appearance on every re-render and a live count flickers (see `src/hooks/useCareTabBadge.ts`). The fallback bar shows the count, capped at `99+`. `iconColor`, `labelStyle` and `icons` stay memoized on their color values so the bar props keep stable references. `minimizeBehavior` stays `never`, because removing a card reads as scroll motion and made the bar shake.
- **`useGlass` is a constant.** `useGlass` from `src/utils/glass.ts` is true on iOS when Liquid Glass is supported. It is not a hook, so read it anywhere, conditions included. Every glass element renders a solid fallback when it is false, as `src/components/GlassIconButton.tsx` does.
- **Strings live in both locales.** Add every visible string to `src/i18n/locales/en/` and `src/i18n/locales/fr/`. Nothing types the French files against the English ones, and `src/i18n/__tests__/translations.test.ts` checks parity for some namespaces only, so a missing French key renders English without an error. The tests mock `react-i18next` with the English strings, so assert English copy.
- **Add an Expo package with `expo install`.** Run `bunx --cwd packages/app expo install <pkg>` from the root. It picks the version that matches the app's Expo SDK, where a plain `bun add` takes the latest release.
- **Jest needs the mocks.** `jest.config.js` maps native modules such as RevenueCat and liquid glass to `src/__tests__/mocks/`, and lists the ESM packages Babel must transform in `transformIgnorePatterns`. A new native dependency usually needs an entry in one or both. Jest does not load `.env`, so the config sets `EXPO_PUBLIC_API_URL` to `http://localhost:3000`.
- **Load the real module at the top of a mock factory.** A function inside a `jest.mock` factory runs during a test, so a `jest.requireActual` there spends the module's cold-cache transform inside the test's 5 s timeout. `lint/eager-require-actual.grit` rejects it. Call `jest.requireActual` once at the top of the factory or at file scope.
- **The Today widget contract.** `encodeTodayWidgetSnapshot` in `src/widgets/today/` must produce the JSON in `templates/LilyWidgetsExtension/Contract/`, and `templates/LilyWidgetsExtension/TodayWidgetSnapshot.swift` decodes that JSON. `src/widgets/today/__tests__/contract.test.ts` compares the two. The widget ships in the binary, so a shape change needs a store build. Regenerate the fixtures with `UPDATE_WIDGET_CONTRACT=1` only for a deliberate change.
- **`CareTasksAttributes` lives in three files.** `modules/expo-live-activity-lily/ios/CareTasksAttributes.swift` and `templates/LilyWidgetsExtension/CareTasksAttributes.swift` stay byte-identical, because the widget extension cannot import the Expo module. The schema in `packages/shared/src/services/push/types.ts` matches them. The server renders every Live Activity string, so the extension has no translations, and the Swift side reads `schemaVersion` defensively so an older build still renders a newer payload.
- **One App Group for both bundle IDs.** `app.json` gives the app and the `LilyWidgetsExtension` target the same App Group. `resolveAppGroup` in `plugins/withLiveActivity/app.plugin.js` throws at prebuild when they differ.
- **Releases.** Read `docs/agents/releases.md` before you change `app.json`, `eas.json`, a native dependency or the Bun version. It covers the OTA trigger, the fingerprint, store build tags, version bumps, EAS environments and the one local build a new App Group needs.

## Loading states

A screen's first load shows a skeleton, never a bare spinner.

```tsx
const isInitialLoading = isLoading && !data
const showSkeleton = useDelayedLoading(isInitialLoading)

{showSkeleton ? (
  <Animated.View entering={FadeIn.duration(300)}>
    <ContentSkeleton />
  </Animated.View>
) : isInitialLoading ? null : (
  <Animated.View entering={FadeIn.duration(300)}>
    {/* content or empty state */}
  </Animated.View>
)}
```

- **`isLoading && !data`** shows the skeleton on the first load only, so a refetch keeps the old content on screen.
- **`useDelayedLoading`** from `src/hooks/useDelayedLoading.ts` turns true only after 300ms, so a fast response never flashes a skeleton.
- **Both branches fade in** with `FadeIn.duration(300)`.
- **The skeleton mirrors the real layout.** Build it from `SkeletonBox` and `SkeletonCircle` in `src/components/skeletons/index.ts` with the real dimensions. Both follow the theme.
- **`ActivityIndicator`** belongs inside buttons and inline actions only, such as a submit button's pending state.

## Screens

- **Care tab** (`src/screens/care/`). Completing a today or overdue task starts a countdown of `CARE_TASK_UNDO_TIMEOUT_MS` from `packages/shared/src/domains/care-task/constants.ts`, and the mutation fires when it ends. Undo clears the timer, so no request goes out. The skip-waiting preference (`useSkipWaitingPreference`) completes at once. An upcoming task opens a modal instead. Care plan steps run through `src/hooks/useCarePlanStepActions.ts`, which plant detail shares. A step with a care type writes a care log, so it gets the same countdown. A free-text step flips at once, and a completed step toggles back to open.
- **Home** (`src/screens/home/`). Water all completes the matching tasks through `src/hooks/useCareAll.ts`, which removes them from the care tasks cache before the response.
- **Chat** (`src/screens/chat/`). Tool calls render through `src/screens/chat/components/tool-renderers.tsx`. A new tool registers in `toolBubbleRenderers` to draw inside the message, in `toolFullWidthRenderers` to draw a card below it, or in both. Renderers also draw persisted messages, so they accept old input shapes. Diagnosis treatment steps were plain strings before care plans existed, and `toProposedStep` accepts both. A diagnosis whose output carries a `carePlanId` shows its `CarePlanCard` in place of the treatment list. The bars and the composer follow `DESIGN_SYSTEM.md`.
- **Add plant** (`src/screens/add-plant/`). On iOS the scanner is `ExpoPlantScannerView` from `@lily/plant-scanner` (see `packages/plant-scanner/CLAUDE.md`). On Android it is `src/screens/add-plant/components/AndroidScannerCamera.tsx`, a Vision Camera frame processor that measures light only and emits the same frame analysis event with no plant or pot. Its lux thresholds are a worklet copy of `luxToLuminosityLevel` in `packages/shared/src/domains/common/luminosity.ts`, and the iOS scanner holds a third copy. Change the three together.
