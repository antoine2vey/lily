# Plant scanner domain language

The terms of the iOS scanner view that the add-plant flow opens. They name what the view reports from the camera feed, how it measures a pot, and the props the app drives it with. The luminosity levels belong to `packages/shared/CONTEXT.md`, and the scan flow around the view belongs to the app.

A term listed under **Avoid** is a synonym that means something else in this code. Do not use it for the concept.

## Frame analysis

| Term | Meaning | Avoid |
| --- | --- | --- |
| **Frame analysis** | One analysis of the camera feed, every 0.3 seconds on iOS, and the `onFrameAnalysis` event (`FrameAnalysisEvent`) that reports it. The app's Android camera emits the same event with only the light fields set. | |
| **Detection** | The model finding a potted plant or a vase in a frame analysis, reported as `plantDetected`. | "plant", which elsewhere means a user's [Plant](../api/CONTEXT.md) |
| **Detection streak** | The number of consecutive frame analyses with a detection. A miss resets it to 0. The app captures a photo when it reaches `AUTO_CAPTURE_STREAK`. | |
| **Lux** | The ambient light of a frame in lux, estimated from the brightness of the camera image and smoothed across analyses. No light sensor is involved. | |
| **Lux level** | The [Luminosity level](../shared/CONTEXT.md) of the smoothed lux, reported as `luxLevel`. | |
| **Pot size estimate** | `potSizeCm`, a pot width guessed from the detection box alone, and `potSizeCategory`, its XS to XL bucket. | "measurement", which is the AR distance between two measure points |

## Measurement

| Term | Meaning | Avoid |
| --- | --- | --- |
| **Measure mode** | The `measureMode` prop. While it is on, each tap places a measure point. | |
| **Measure point** | A point placed on a surface by raycast from the centre of the view (`ARMeasurePoint`). It carries its axis and its index, 0 or 1, within that axis. | |
| **Axis** | `MeasureAxis`, `width` or `height`. Measuring starts on width and moves to height after two width points. | |
| **Measurement** | The distance in cm between the two measure points of one axis (`ARMeasurementEvent`). | |
| **Reset generation** | The `resetGeneration` counter. Each increase clears every measure point and returns to the width axis. | |

## Capture

| Term | Meaning | Avoid |
| --- | --- | --- |
| **Capture request** | The `captureRequested` prop. Each change to `true` takes one JPEG of the current AR frame and reports its path in `onPhotoCaptured`. | |

## Relationships

- **app** renders the view in `UnifiedScannerScreen` on iOS. It owns the auto-capture, the crosshair and the photo upload. On Android it renders its own `AndroidScannerCamera`, which emits the same frame analysis with light only. See [packages/app/CONTEXT.md](../app/CONTEXT.md).
- **shared** owns the luminosity levels and their lux bands, which the lux level follows, and the detect prompt that uses the same pot size bands. See [packages/shared/CONTEXT.md](../shared/CONTEXT.md).
