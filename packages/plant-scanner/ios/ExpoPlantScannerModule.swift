import ExpoModulesCore

public class ExpoPlantScannerModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoPlantScanner")

    View(ExpoPlantScannerView.self) {
      Events(
        "onFrameAnalysis",
        "onSessionReady",
        "onSessionError",
        "onPointPlaced",
        "onMeasurement",
        "onPhotoCaptured",
        "onCaptureFailed"
      )

      Prop("isActive") { (view: ExpoPlantScannerView, isActive: Bool) in
        view.setActive(isActive)
      }

      Prop("measureMode") { (view: ExpoPlantScannerView, measureMode: Bool) in
        view.setMeasureMode(measureMode)
      }

      // Capture a photo when generation counter increments
      Prop("captureGeneration") { (view: ExpoPlantScannerView, generation: Int) in
        if generation > view.lastCaptureGeneration {
          view.lastCaptureGeneration = generation
          view.capturePhoto()
        }
      }

      // Reset measurement when generation counter increments
      Prop("resetGeneration") { (view: ExpoPlantScannerView, generation: Int) in
        if generation > view.lastResetGeneration {
          view.lastResetGeneration = generation
          view.resetMeasurement()
        }
      }

      // Receive tap coordinates from JS (x, y as fractions 0-1, id to dedupe)
      Prop("tapPoint") { (view: ExpoPlantScannerView, point: [String: Double]?) in
        guard let point = point,
              let x = point["x"],
              let y = point["y"],
              let id = point["id"] else { return }
        // Dedupe: only process new taps
        guard id != view.lastTapId else { return }
        view.lastTapId = id
        let sceneBounds = view.sceneViewBounds
        let viewPoint = CGPoint(
          x: x * Double(sceneBounds.width),
          y: y * Double(sceneBounds.height)
        )
        view.performMeasureTap(at: viewPoint)
      }
    }
  }
}
