/**
 * Frame analysis worklet for real-time lux estimation.
 *
 * VisionCamera v4 Frame objects do NOT expose EXIF metadata (ISO, shutter, etc.).
 * Instead, we analyze the actual pixel data from a resized frame buffer:
 *
 * Computes average perceived luminance from RGB pixels,
 * then maps to an approximate lux value using a calibrated curve.
 *
 * Plant detection is handled separately by the TFLite ML model
 * (EfficientDet-Lite0) in the frame processor.
 */

export interface LuxAnalysis {
  /** Approximate lux value derived from pixel brightness */
  lux: number
  /** Luminosity level 1-5 */
  level: number
}

/**
 * Analyze a resized RGB frame buffer for brightness/lux estimation.
 * Subsamples every Nth pixel for performance when using larger buffers.
 *
 * @param data - Uint8Array of RGB pixel data from resized frame
 * @param step - Sample every Nth pixel (1 = all, 4 = every 4th, etc.)
 */
export function analyzeFrameForLux(
  data: Uint8Array,
  step: number = 1
): LuxAnalysis {
  'worklet'

  let totalBrightness = 0
  let sampledCount = 0

  // Step through pixels (step * 3 bytes per pixel for RGB)
  const byteStep = step * 3
  for (let i = 0; i < data.length - 2; i += byteStep) {
    const r = data[i] ?? 0
    const g = data[i + 1] ?? 0
    const b = data[i + 2] ?? 0

    // Perceived luminance (ITU-R BT.601)
    totalBrightness += 0.299 * r + 0.587 * g + 0.114 * b
    sampledCount++
  }

  if (sampledCount === 0) {
    return { lux: 0, level: 1 }
  }

  const avgBrightness = totalBrightness / sampledCount

  // Brightness-to-lux logarithmic curve:
  // brightness 10-30 → ~50-200 lux, 80-140 → ~1000-5000 lux, 200+ → ~20000+ lux
  const clampedBrightness = Math.max(1, Math.min(255, avgBrightness))
  const lux = (clampedBrightness / 25) ** 3.2 * 15

  // Lux-to-level mapping (inline to avoid cross-function worklet calls)
  let level: number
  if (lux < 250) level = 1
  else if (lux < 1_000) level = 2
  else if (lux < 5_000) level = 3
  else if (lux < 25_000) level = 4
  else level = 5

  return { lux, level }
}
