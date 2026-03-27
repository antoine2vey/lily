import TensorFlowLite

/// Result of a single frame analysis for plant/pot detection.
struct PlantDetectionResult {
  let plantDetected: Bool
  let detectionStreak: Int
  let potBbox: NormalizedBbox?
  let potSizeCm: Double?
  let potSizeCategory: String?
  let potConfidence: Double?
}

struct NormalizedBbox {
  let x: Double      // 0-1 left edge
  let y: Double      // 0-1 top edge
  let width: Double   // 0-1
  let height: Double  // 0-1
}

/// Runs TFLite inference on camera frames to detect potted plants and estimate pot size.
class PlantDetector {
  private var interpreter: Interpreter?
  private var consecutiveDetections: Int = 0

  // Model input size
  private let inputWidth = 320
  private let inputHeight = 320

  // Camera intrinsics (iPhone 12+ wide lens)
  private let sensorWidthMm: Double = 5.6
  private let focalLengthMm: Double = 4.2

  // COCO class IDs: 63 = potted plant, 58 = vase
  private let targetClassIds: Set<Int> = [63, 58]

  init() {
    loadModel()
  }

  private func loadModel() {
    // Look for the model in the module bundle first, then main bundle
    let modelPath: String? =
      Bundle(for: PlantDetector.self).path(forResource: "efficientdet_lite0", ofType: "tflite")
      ?? Bundle.main.path(forResource: "efficientdet_lite0", ofType: "tflite")

    guard let modelPath = modelPath else {
      return
    }

    do {
      var options = Interpreter.Options()
      options.threadCount = 2

      var delegates: [Delegate] = []
      if let coreMLDelegate = CoreMLDelegate() {
        delegates.append(coreMLDelegate)
      }

      interpreter = try Interpreter(modelPath: modelPath, options: options, delegates: delegates)
      try interpreter?.allocateTensors()
    } catch {
      // Model loading failed — detect() will return default result
    }
  }

  /// Run detection on a camera frame. Thread-safe — call from analysis queue.
  func detect(pixelBuffer: CVPixelBuffer) -> PlantDetectionResult {
    guard let interpreter = interpreter else {
      return emptyResult()
    }

    // Convert CVPixelBuffer to 320x320 RGB uint8 data
    guard let inputData = prepareInput(pixelBuffer: pixelBuffer) else {
      consecutiveDetections = 0
      return emptyResult()
    }

    do {
      try interpreter.copy(inputData, toInputAt: 0)
      try interpreter.invoke()

      // EfficientDet output: [0]=boxes, [1]=classes, [2]=scores, [3]=count
      let boxesTensor = try interpreter.output(at: 0)
      let classesTensor = try interpreter.output(at: 1)
      let scoresTensor = try interpreter.output(at: 2)
      let countTensor = try interpreter.output(at: 3)

      let boxes = boxesTensor.data.withUnsafeBytes { Array($0.bindMemory(to: Float32.self)) }
      let classes = classesTensor.data.withUnsafeBytes { Array($0.bindMemory(to: Float32.self)) }
      let scores = scoresTensor.data.withUnsafeBytes { Array($0.bindMemory(to: Float32.self)) }
      let count = countTensor.data.withUnsafeBytes { Array($0.bindMemory(to: Float32.self)) }

      let numDetections = Int(count.first ?? 0)

      var plantDetected = false
      var bestIdx = -1
      var bestScore: Float = 0

      for i in 0..<numDetections {
        let classId = Int(classes[i])
        let score = scores[i]
        if targetClassIds.contains(classId) && score > 0.3 {
          plantDetected = true
          if score > bestScore {
            bestIdx = i
            bestScore = score
          }
        }
      }

      if plantDetected {
        consecutiveDetections += 1
      } else {
        consecutiveDetections = 0
      }

      // Extract bbox and pot size for high-confidence detections
      var potBbox: NormalizedBbox?
      var potSizeCm: Double?
      var potSizeCategory: String?

      if bestIdx >= 0 && bestScore > 0.4 {
        // EfficientDet boxes: [ymin, xmin, ymax, xmax] normalized
        let ymin = Double(boxes[bestIdx * 4])
        let xmin = Double(boxes[bestIdx * 4 + 1])
        let ymax = Double(boxes[bestIdx * 4 + 2])
        let xmax = Double(boxes[bestIdx * 4 + 3])

        let bboxWidth = xmax - xmin
        let bboxHeight = ymax - ymin

        potBbox = NormalizedBbox(
          x: xmin, y: ymin, width: bboxWidth, height: bboxHeight
        )

        let sizeCm = estimatePotSize(bboxWidth: bboxWidth)
        potSizeCm = round(sizeCm * 10) / 10
        potSizeCategory = cmToCategory(cm: sizeCm)
      }

      return PlantDetectionResult(
        plantDetected: plantDetected,
        detectionStreak: consecutiveDetections,
        potBbox: potBbox,
        potSizeCm: potSizeCm,
        potSizeCategory: potSizeCategory,
        potConfidence: bestScore > 0 ? Double(bestScore) : nil
      )
    } catch {
      consecutiveDetections = 0
      return emptyResult()
    }
  }

  func reset() {
    consecutiveDetections = 0
  }

  // MARK: - Input Preparation

  /// Convert CVPixelBuffer (YUV from ARKit) to 320×320 RGB uint8 Data for TFLite.
  private func prepareInput(pixelBuffer: CVPixelBuffer) -> Data? {
    CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly) }

    let width = CVPixelBufferGetWidth(pixelBuffer)
    let height = CVPixelBufferGetHeight(pixelBuffer)

    // Create CIImage and resize to 320x320 RGB
    let ciImage = CIImage(cvPixelBuffer: pixelBuffer)
    let scaleX = CGFloat(inputWidth) / CGFloat(width)
    let scaleY = CGFloat(inputHeight) / CGFloat(height)
    let scaled = ciImage.transformed(by: CGAffineTransform(scaleX: scaleX, y: scaleY))

    let context = CIContext()
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    let bitmapInfo = CGBitmapInfo(rawValue: CGImageAlphaInfo.noneSkipLast.rawValue)

    var rgbaData = Data(count: inputWidth * inputHeight * 4)
    rgbaData.withUnsafeMutableBytes { ptr in
      guard let baseAddress = ptr.baseAddress else { return }
      context.render(
        scaled,
        toBitmap: baseAddress,
        rowBytes: inputWidth * 4,
        bounds: CGRect(x: 0, y: 0, width: inputWidth, height: inputHeight),
        format: .RGBA8,
        colorSpace: colorSpace
      )
    }

    // Convert RGBA to RGB (drop alpha channel)
    var rgbData = Data(capacity: inputWidth * inputHeight * 3)
    rgbaData.withUnsafeBytes { ptr in
      let bytes = ptr.bindMemory(to: UInt8.self)
      for i in 0..<(inputWidth * inputHeight) {
        rgbData.append(bytes[i * 4])     // R
        rgbData.append(bytes[i * 4 + 1]) // G
        rgbData.append(bytes[i * 4 + 2]) // B
      }
    }

    return rgbData
  }

  // MARK: - Pot Size Heuristics

  private func estimatePotSize(bboxWidth: Double) -> Double {
    let distanceCm: Double
    if bboxWidth > 0.5 {
      distanceCm = 25
    } else if bboxWidth > 0.3 {
      distanceCm = 35
    } else if bboxWidth > 0.15 {
      distanceCm = 40
    } else {
      distanceCm = 55
    }
    return (bboxWidth * sensorWidthMm * distanceCm) / focalLengthMm
  }

  private func cmToCategory(cm: Double) -> String {
    if cm < 10 { return "XS" }
    if cm < 15 { return "S" }
    if cm < 25 { return "M" }
    if cm < 35 { return "L" }
    return "XL"
  }

  private func emptyResult() -> PlantDetectionResult {
    PlantDetectionResult(
      plantDetected: false, detectionStreak: 0,
      potBbox: nil, potSizeCm: nil, potSizeCategory: nil, potConfidence: nil
    )
  }
}
