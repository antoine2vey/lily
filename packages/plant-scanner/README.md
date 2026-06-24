# @lily/plant-scanner

> An iOS-only Expo native module for real-time AR plant/pot detection, size measurement, and ambient-light analysis — powered by ARKit and TensorFlow Lite.

## Overview

`@lily/plant-scanner` is the camera intelligence behind Lily's add-plant flow. It detects potted plants and pots in the live camera feed with an on-device ML model, estimates pot dimensions via AR raycasting, and reports ambient light (lux) in real time. Users tap on an AR surface to place measurement points; the module captures a photo annotated with the measured width/height and a detection confidence. It is **iOS-only by design** — the implementation is built on Apple's ARKit, which has no Android equivalent.

## Architecture

```
React Native (app)
      │  <ExpoPlantScannerView ... />  (props in, events out)
      ▼
Expo Modules bridge (Swift)
      ├── PlantDetector.swift   # TensorFlow Lite (EfficientDet Lite 0) → plant/pot bbox
      ├── PotMeasurer.swift     # ARKit raycasting → 3D measurement points + live lines
      ├── LuxAnalyzer.swift     # YUV brightness sampling → lux estimate (5 levels)
      └── ExpoPlantScannerView.swift  # ARSCNView session lifecycle + event dispatch
```

Per-frame ML inference runs at ~300ms intervals (not every frame) to avoid thermal throttling, with a Core ML delegate for GPU acceleration.

## API surface

```typescript
import { ExpoPlantScannerView } from '@lily/plant-scanner'

<ExpoPlantScannerView
  isActive                       // enable/pause the ARKit session
  measureMode                    // toggle tap-to-measure
  captureRequested               // trigger a photo capture
  tapPoint={{ x, y, id }}        // normalized tap coordinates
  onFrameAnalysis={(e) => …}     // { plantDetected, lux, luxLevel, potBbox, potSizeCm, potConfidence, … }
  onPointPlaced={(e) => …}       // an AR measurement point (world coords)
  onMeasurement={(e) => …}       // { distanceCm, axis: 'width' | 'height' }
  onPhotoCaptured={(e) => …}     // { path } — file:// URL to the captured JPEG
  onSessionReady={() => …}
  onSessionError={(e) => …}
/>
```

See `src/types.ts` for the complete prop and event-payload types.

## Project Structure

```
src/
├── index.ts                     # Public exports (component + types)
├── ExpoPlantScannerView.tsx     # React wrapper (unwraps native events)
└── types.ts                     # All TypeScript interfaces
ios/
├── ExpoPlantScannerModule.swift # Expo module definition (props/events)
├── ExpoPlantScannerView.swift   # ARSCNView controller + session lifecycle
├── PlantDetector.swift          # TensorFlow Lite inference
├── PotMeasurer.swift            # AR raycasting + measurement rendering
├── LuxAnalyzer.swift            # Ambient-light estimation
├── ExpoPlantScanner.podspec     # Native deps + bundled .tflite model
└── efficientdet_lite0.tflite    # On-device detection model (~4.3 MB)
```

> The repo's `.gitignore` excludes native build output everywhere **except** `packages/plant-scanner/ios/`, which is tracked so the Swift source and the bundled ML model live in version control.

## Key Concepts

- **EfficientDet Lite 0** — an edge-optimized COCO detector (320×320) targeting "potted plant" and "vase" classes; pot width is estimated from the bounding box plus camera focal length.
- **ARKit measurement** — world tracking with plane detection and multi-target raycasting; SceneKit renders live measurement lines that update as the phone moves between taps.
- **Lux estimation** — samples the YUV luma plane and maps brightness to a 5-level lux scale (low light → full sun) with an exponential moving average to smooth frame noise.

## Development Workflow

This module compiles as part of the app via the Expo Modules API — there's no standalone build step. It's consumed by `packages/app` (the add-plant flow's `UnifiedScannerScreen`), which falls back to a plain camera component on Android.

```bash
# From the repository root:
bun run --filter=@lily/plant-scanner tsc       # typecheck the TS surface
bun run --filter=@lily/plant-scanner lint       # Biome
# Native code builds during `expo prebuild` / EAS Build of packages/app.
```

## Quick Reference

| Command | What it does |
| --- | --- |
| `tsc` | `tsc --noEmit` |
| `lint` / `lint:fix` | Biome check / autofix |

## Related Documentation

- [Root README](../../README.md) — monorepo overview
- [`@lily/app`](../app/README.md) — consumes this module in the add-plant flow
- [Expo Modules API](https://docs.expo.dev/modules/overview/) · [ARKit](https://developer.apple.com/documentation/arkit)
