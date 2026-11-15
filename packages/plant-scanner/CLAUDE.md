# packages/plant-scanner

The native camera view of the iOS add-plant flow. It is an Expo module in Swift that runs an ARKit session, finds a potted plant with an on-device TensorFlow Lite model, estimates the ambient light and measures the pot by AR raycast. The app's native build compiles it. It has no build of its own and no Android code, because `expo-module.config.json` lists `ios` alone. On Android the app renders `packages/app/src/screens/add-plant/components/AndroidScannerCamera.tsx` instead, which imports only the types from this package. `UnifiedScannerScreen.tsx` still imports `ExpoPlantScannerView` as a value on every platform, so the module-level code in `src/`, such as the `requireNativeViewManager` call, also runs on Android.

## Commands

Run every command from the monorepo root.

| Command | What it does |
|---|---|
| `bun run --filter=@lily/plant-scanner tsc` | Typechecks the TypeScript wrapper and types |
| `bun run --filter=@lily/plant-scanner lint` | Biome. `lint:fix` writes the fixes |
| `bun run --filter=@lily/plant-scanner test` | Vitest. Checks `targetClassIds` against the model's label map |

The Swift code compiles only inside the app's native build, with `bun run --filter=@lily/app ios` or an EAS build.

## Layout

- `src/types.ts` is the contract with the Swift side. `ExpoPlantScannerViewProps` holds the props and the event payloads the app sees. `NativeExpoPlantScannerViewProps` holds the same events wrapped in `nativeEvent`, and `src/ExpoPlantScannerView.tsx` unwraps each one before it calls the app's handler.
- `ios/ExpoPlantScannerModule.swift` declares the props and events. `ios/ExpoPlantScannerView.swift` owns the AR session, runs the frame analysis and dispatches every event.
- `ios/PlantDetector.swift`, `ios/LuxAnalyzer.swift` and `ios/PotMeasurer.swift` hold the detection, light and measurement logic. The sections below cover each one.
- `ios/efficientdet_lite0.tflite` is the detection model. `ios/ExpoPlantScanner.podspec` bundles every `.tflite` file in `ios/` as a resource.
- The package has no config plugin. The AR measurement's `NSMotionUsageDescription` is the `motionUsagePermission` option of the `expo-location` plugin in `packages/app/app.json`, because that plugin always writes the key, with its own generic default when the option is missing.
- The root `.gitignore` ignores the generated native folders only at the root and in `packages/app`. No rule matches `packages/plant-scanner/ios/`, so the Swift source and the model are tracked. The `!/packages/plant-scanner/ios/` line there re-includes a folder that no rule ignores.

## Rules

- **A prop or event spans both languages.** Add it to both prop interfaces in `src/types.ts` and declare it in `ios/ExpoPlantScannerModule.swift`. An event also needs an unwrapping handler in `src/ExpoPlantScannerView.tsx`. `AndroidScannerCamera` builds each `FrameAnalysisEvent` by hand, so a new field there needs an Android value too.
- **`captureRequested` fires on each change to `true`.** React Native sends a prop to the native view only when its value changes. The app sets it back to `false` in its `onPhotoCaptured` handler, which lets the next `true` request another photo. A capture that fails (no AR frame yet, or a JPEG or file write error) emits no event, so the prop stays `true`.
- **`resetGeneration` counts up.** The view clears the measurement only when the value is greater than the last one it saw. Increment it to reset, as `resetAR` in `packages/app/src/screens/add-plant/UnifiedScannerScreen.tsx` does.
- **Each `tapPoint` needs a new `id`.** The view drops a tap whose `id` equals the previous one. It ignores `x` and `y` and raycasts from the centre of the view, where the app draws its crosshair. In measure mode the view's own tap recognizer also places a point at the centre.
- **`onSessionReady` fires on every return to normal tracking.** ARKit reports `.normal` again after each spell of limited tracking, so a handler must tolerate repeats. `onSessionError` also fires for the transient limited states (excessive motion, insufficient features), so an error event is not always fatal.
- **The app decides when to capture.** `UnifiedScannerScreen` sets `captureRequested` once `detectionStreak` reaches `AUTO_CAPTURE_STREAK`. The `autoCaptureThreshold` constant in `ios/ExpoPlantScannerView.swift` has no reader.
- **A missing model fails silently.** `PlantDetector` looks for `efficientdet_lite0.tflite` in the module bundle, then the main bundle. When neither has it, or the interpreter fails to load, every frame reports no plant and no error event fires. Check the model first when detection never triggers on a device.
- **Keep the three lux mappings in step.** `ios/LuxAnalyzer.swift`, `AndroidScannerCamera.tsx` and `luxToLuminosityLevel` in `packages/shared/src/domains/common/luminosity.ts` each split lux into five levels at 250, 1000, 5000 and 25000. Both camera paths also share the brightness to lux conversion and the smoothing in [Light](#light). Change them together.
- **The axis colors match the app's crosshair.** `PotMeasurer` draws the width axis white and the height axis `#5B8C5A`, and the crosshair in `UnifiedScannerScreen.tsx` uses the same two colors for the active axis. `#5B8C5A` is the green that `primary` held before the redesign, not the current token. Change both sides together.

## Frame analysis

`ExpoPlantScannerView.swift` analyses one AR frame every 0.3 seconds (`analysisInterval`) on its own serial queue and emits one `onFrameAnalysis` event per analysis. The app reads `plantDetected`, `detectionStreak`, `lux` and `luxLevel`. It takes the pot size from the measurement, so `potBbox`, `potSizeCm`, `potSizeCategory` and `potConfidence` have no consumer in the app.

### Detection

- The model is EfficientDet Lite0, a COCO detector with a 320 by 320 input. It runs on two threads, with the Core ML delegate when the device provides one.
- It accepts class indices 63 (potted plant) and 85 (vase) (`targetClassIds`). The model's class output is the zero-based line of the `labelmap.txt` embedded in the model, which lists COCO ids 1 to 90 with `???` for the unused ones, so each index is the COCO id minus one. `src/__tests__/target-class-ids.test.ts` reads that label map and fails when an index names another class. A score above 0.3 counts as a plant. `detectionStreak` counts consecutive analyses with a plant, and a miss resets it to 0.
- Above 0.4 the best box also yields `potBbox`, normalized from 0 to 1, and the size estimate.
- The size estimate has no depth data. It guesses the camera distance from the box width (25, 35, 40 or 55 cm), then applies a 5.6 mm sensor width and a 4.2 mm focal length. `cmToCategory` buckets the width as XS below 10 cm, S below 15, M below 25, L below 35 and XL above that. The `careInstructions` fragment in `packages/shared/src/services/ai/prompts.ts` uses the same bands for `potSize`, and the detect, recognition and card scan prompts include it.

### Light

`LuxAnalyzer` samples about 4000 pixels of the luma plane and clamps their mean brightness to the range 1 to 255. It turns that into lux with `pow(brightness / 25, 3.2) * 15`, smooths the result across analyses with an EMA alpha of 0.3 and maps it to a luminosity level. `AndroidScannerCamera.tsx` applies the same clamp, curve and alpha.

## Measurement

- While `measureMode` is on, each tap places a point by raycast from the view centre. The raycast tries existing plane geometry, then an infinite existing plane, then an estimated plane, then the deprecated `hitTest` against planes and feature points.
- Two points measure the width. The axis then switches to height, and two more points measure the height. After four points the measurer ignores taps until a reset.
- Each point emits `onPointPlaced` with its axis and its `index` (0 or 1) within that axis. The second point of an axis also emits `onMeasurement` with the distance in cm, rounded to one decimal.
- Between the two taps of an axis, a live line follows the view centre.

## Session and photo

- `isActive` runs and pauses the session, and removing the view from its window also pauses it. Returning to a window does not restart it. Only a change of `isActive` to `true` does. `UnifiedScannerScreen` passes a constant `true`, so a view that leaves its window stays paused until it remounts. The session runs world tracking with horizontal and vertical plane detection, under ARKit's coaching overlay.
- A container view controller locks the AR view to portrait. ARKit frames arrive in sensor landscape, so `capturePhoto` writes the JPEG with orientation `.right` to display upright. It saves the file in the temporary directory and reports it as a `file://` path.
