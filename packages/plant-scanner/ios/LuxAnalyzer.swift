import CoreVideo

/// Result of lux analysis on a single frame.
struct LuxResult {
  let lux: Double
  let level: Int // 1-5
}

/// Estimates ambient light level from camera frame luminance data.
/// Uses the Y plane from YUV pixel buffers (no RGB conversion needed).
class LuxAnalyzer {
  private var smoothedLux: Double = -1

  /// Analyze a CVPixelBuffer (YUV 420 format from ARKit) for brightness.
  func analyze(pixelBuffer: CVPixelBuffer) -> LuxResult {
    CVPixelBufferLockBaseAddress(pixelBuffer, .readOnly)
    defer { CVPixelBufferUnlockBaseAddress(pixelBuffer, .readOnly) }

    // Y plane is the first plane in YUV 420 BiPlanar format
    guard let baseAddress = CVPixelBufferGetBaseAddressOfPlane(pixelBuffer, 0) else {
      return LuxResult(lux: smoothedLux > 0 ? smoothedLux : 0, level: 1)
    }

    let width = CVPixelBufferGetWidthOfPlane(pixelBuffer, 0)
    let height = CVPixelBufferGetHeightOfPlane(pixelBuffer, 0)
    let bytesPerRow = CVPixelBufferGetBytesPerRowOfPlane(pixelBuffer, 0)
    let yPlane = baseAddress.assumingMemoryBound(to: UInt8.self)

    // Sample ~4000 pixels for performance
    let totalPixels = width * height
    let step = max(1, totalPixels / 4000)

    var totalBrightness: Double = 0
    var sampledCount: Int = 0

    var pixelIndex = 0
    while pixelIndex < totalPixels {
      let row = pixelIndex / width
      let col = pixelIndex % width
      let brightness = Double(yPlane[row * bytesPerRow + col])
      totalBrightness += brightness
      sampledCount += 1
      pixelIndex += step
    }

    guard sampledCount > 0 else {
      return LuxResult(lux: smoothedLux > 0 ? smoothedLux : 0, level: 1)
    }

    let avgBrightness = totalBrightness / Double(sampledCount)

    // Brightness to lux: calibrated power curve
    let clamped = max(1.0, min(255.0, avgBrightness))
    let rawLux = pow(clamped / 25.0, 3.2) * 15.0

    // Exponential moving average (alpha = 0.3)
    if smoothedLux < 0 {
      smoothedLux = rawLux
    } else {
      smoothedLux += 0.3 * (rawLux - smoothedLux)
    }

    // Map to level (1-5)
    let level: Int
    if smoothedLux < 250 {
      level = 1       // Low light
    } else if smoothedLux < 1_000 {
      level = 2       // Medium
    } else if smoothedLux < 5_000 {
      level = 3       // Bright indirect
    } else if smoothedLux < 25_000 {
      level = 4       // Direct light
    } else {
      level = 5       // Full sun
    }

    return LuxResult(lux: smoothedLux, level: level)
  }

  /// Reset the smoothed lux value.
  func reset() {
    smoothedLux = -1
  }
}
