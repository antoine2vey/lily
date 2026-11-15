# @lily/plant-scanner

The camera view of Lily's add-plant flow on iOS. It is an Expo module written in Swift. While the camera is open, it does four things:

- It detects a potted plant with an on-device TensorFlow Lite model (EfficientDet Lite0). [Detection](CLAUDE.md#detection) names the classes it accepts.
- It estimates the ambient light from the camera image, on Lily's five luminosity levels.
- It measures a pot's width and height by AR raycast, with SceneKit lines that follow the phone between taps.
- It captures a photo of the current frame for the app to identify.

It runs on iOS only, because it is built on ARKit. On Android the app shows its own Vision Camera component, which measures light and detects nothing.

## How it builds

The module has no build of its own. The app's native build compiles the Swift code through the Expo Modules API. The motion permission string for the AR measurement is the `motionUsagePermission` option of the `expo-location` plugin in `packages/app/app.json`. The podspec pulls in TensorFlow Lite and bundles the model.

## Usage

```tsx
import { ExpoPlantScannerView } from '@lily/plant-scanner'

<ExpoPlantScannerView
  isActive                            // runs or pauses the AR session
  measureMode={measureMode}           // turns tap to measure on
  captureGeneration={captureGeneration} // increment it to take one photo
  resetGeneration={resetGeneration}   // increment it to clear the measurement
  tapPoint={tapPoint}                 // { x, y, id }; each new id places a point at the view centre
  onFrameAnalysis={(e) => {}}         // detection, streak, lux and luxLevel, every 0.3 seconds
  onPointPlaced={(e) => {}}           // a measure point with its axis and index
  onMeasurement={(e) => {}}           // { distanceCm, axis } once an axis has two points
  onPhotoCaptured={(e) => {}}         // { path }, a file:// URL to the JPEG
  onCaptureFailed={(e) => {}}         // { reason }, the request took no photo
  onSessionReady={() => {}}
  onSessionError={(e) => {}}          // { message }
/>
```

`src/types.ts` holds the full prop and event types. `packages/app/src/screens/add-plant/UnifiedScannerScreen.tsx` is the one screen that renders the view.

## Commands

Run them from the monorepo root.

| Command | What it does |
| --- | --- |
| `bun run --filter=@lily/plant-scanner tsc` | Typecheck |
| `bun run --filter=@lily/plant-scanner lint` | Biome. `lint:fix` applies the fixes |
| `bun run --filter=@lily/plant-scanner test` | Vitest |

## In the monorepo

- `@lily/app` renders the view in the add-plant flow and reuses its event types for the Android camera.
- `@lily/shared` defines the luminosity levels that `luxLevel` follows.

## Related docs

- [CLAUDE.md](CLAUDE.md) holds the rules for changing the module.
- [CONTEXT.md](CONTEXT.md) defines its terms.
- [packages/app/README.md](../app/README.md) covers running the app that builds it.
- [Expo Modules API](https://docs.expo.dev/modules/overview/) and [ARKit](https://developer.apple.com/documentation/arkit) are the upstream references.
