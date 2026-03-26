/**
 * Pot size detection utilities for frame processor.
 *
 * Uses object detection bounding boxes + camera intrinsics to estimate
 * pot diameter. The actual object detection runs via a native plugin
 * (COCO YOLO model detecting "vase" class 86 and "potted plant" class 63).
 *
 * Size estimation formula:
 *   diameter_cm ≈ (bbox_width / image_width) * sensor_width_mm
 *                 * distance_cm / focal_length_mm
 *
 * Since we don't know exact distance, we use a heuristic:
 * - Typical phone-to-pot distance: 30-50cm
 * - We use 40cm as default, refined by how much of the frame the pot fills
 */

export interface BoundingBox {
  x: number // Normalized 0-1 (left edge)
  y: number // Normalized 0-1 (top edge)
  width: number // Normalized 0-1
  height: number // Normalized 0-1
}

export interface PotDetection {
  bbox: BoundingBox
  sizeCm: number
  sizeCategory: PotSizeCategory
  confidence: number
}

export type PotSizeCategory = 'XS' | 'S' | 'M' | 'L' | 'XL'

// Typical iPhone sensor width in mm (iPhone 12+ wide lens)
const DEFAULT_SENSOR_WIDTH_MM = 5.6
// Default focal length in mm (iPhone wide lens ~26mm equivalent, ~4.2mm actual)
const DEFAULT_FOCAL_LENGTH_MM = 4.2
// Default assumed distance from phone to pot in cm
const DEFAULT_DISTANCE_CM = 40

/**
 * Estimate pot diameter in cm from a normalized bounding box.
 * Must be called from worklet context.
 */
export function estimatePotSize(
  bboxWidth: number,
  sensorWidthMm: number,
  focalLengthMm: number
): number {
  'worklet'
  // Refine distance estimate based on how much of frame the pot fills
  // If pot fills >50% of frame, it's closer (~25cm)
  // If pot fills <20% of frame, it's farther (~60cm)
  const distanceCm =
    bboxWidth > 0.5
      ? 25
      : bboxWidth > 0.3
        ? 35
        : bboxWidth > 0.15
          ? DEFAULT_DISTANCE_CM
          : 55

  return (bboxWidth * sensorWidthMm * distanceCm) / focalLengthMm
}

/**
 * Map a diameter in cm to a pot size category.
 */
export function cmToCategory(cm: number): PotSizeCategory {
  'worklet'
  if (cm < 10) return 'XS'
  if (cm < 15) return 'S'
  if (cm < 25) return 'M'
  if (cm < 35) return 'L'
  return 'XL'
}

/**
 * Process object detection results from the native plugin.
 * Filters for pot/vase detections and estimates size.
 *
 * Called from within the frame processor worklet.
 */
export function processPotDetections(
  detections: ReadonlyArray<{
    label: string
    confidence: number
    bbox: BoundingBox
  }>,
  sensorWidthMm = DEFAULT_SENSOR_WIDTH_MM,
  focalLengthMm = DEFAULT_FOCAL_LENGTH_MM
): PotDetection | null {
  'worklet'

  // Filter for pot-related detections with sufficient confidence
  let bestDetection: (typeof detections)[number] | null = null
  let bestConfidence = 0

  for (let i = 0; i < detections.length; i++) {
    const det = detections[i]!
    const isPot = det.label === 'vase' || det.label === 'potted plant'
    if (isPot && det.confidence > 0.4 && det.confidence > bestConfidence) {
      bestDetection = det
      bestConfidence = det.confidence
    }
  }

  if (!bestDetection) return null

  const sizeCm = estimatePotSize(
    bestDetection.bbox.width,
    sensorWidthMm,
    focalLengthMm
  )

  return {
    bbox: bestDetection.bbox,
    sizeCm: Math.round(sizeCm),
    sizeCategory: cmToCategory(sizeCm),
    confidence: bestDetection.confidence,
  }
}
