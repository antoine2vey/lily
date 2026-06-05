import { Array, Option, Schema } from 'effect'

/**
 * The 8 cardinal + intercardinal compass directions a room's window can face,
 * in clockwise order starting at North. Consumed by the indoor watering model
 * (`orientationFactor`) to refine seasonal light estimates.
 */
export const ORIENTATIONS = [
  'N',
  'NE',
  'E',
  'SE',
  'S',
  'SW',
  'W',
  'NW',
] as const

export type Orientation = (typeof ORIENTATIONS)[number]

/** Schema.Literal union — reuse in request/response schemas for free validation. */
export const OrientationSchema = Schema.Literal(...ORIENTATIONS)

/** Display metadata (arrow icon + center bearing). Labels are i18n, not here. */
export const ORIENTATION_INFO: Record<
  Orientation,
  { icon: string; degrees: number }
> = {
  N: { icon: '⬆️', degrees: 0 },
  NE: { icon: '↗️', degrees: 45 },
  E: { icon: '➡️', degrees: 90 },
  SE: { icon: '↘️', degrees: 135 },
  S: { icon: '⬇️', degrees: 180 },
  SW: { icon: '↙️', degrees: 225 },
  W: { icon: '⬅️', degrees: 270 },
  NW: { icon: '↖️', degrees: 315 },
}

/**
 * Snap a compass heading in degrees (0 = N, 90 = E, 180 = S, 270 = W) to the
 * nearest of the 8 directions. Each bucket is 45° wide and centered on its
 * direction, so N covers [337.5, 360) ∪ [0, 22.5). Handles negatives and
 * values ≥ 360 by normalizing first.
 */
export const headingToOrientation = (headingDeg: number): Orientation => {
  const normalized = ((headingDeg % 360) + 360) % 360
  const index = Math.round(normalized / 45) % 8
  return Option.getOrElse(
    Array.get(ORIENTATIONS, index),
    (): Orientation => 'N'
  )
}
