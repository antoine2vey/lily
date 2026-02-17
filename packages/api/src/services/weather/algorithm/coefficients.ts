/**
 * Named constants and coefficient lookup tables for the care adjustment algorithm.
 *
 * Extracts all magic numbers into descriptive named constants so they can be
 * referenced and maintained from a single location.
 */

import { CROP_COEFFICIENTS, DEFAULT_KC } from '@lily/shared'
import { Duration, Option, pipe } from 'effect'

// ─── Time Constants ──────────────────────────────────────────────────────────

export const MS_PER_DAY = Duration.toMillis(Duration.days(1))

// ─── Crop Coefficient Rating Modifier ────────────────────────────────────────
// Maps wateringRating (1-5) to a multiplier:
// rating 1 = very low water needs -> 0.7x
// rating 3 = average -> 1.0x
// rating 5 = very high -> 1.3x

export const RATING_MODIFIER_BASE = 0.7
export const RATING_MODIFIER_STEP = 0.15

// ─── Default Fallback Values ─────────────────────────────────────────────────
// Used when weather data fields are null (sensor/API gaps)

/** Moderate temperature assumed when temperatureMean is missing (Celsius) */
export const DEFAULT_TEMPERATURE_MEAN_C = 20

/** Moderate humidity assumed when humidity is missing (%) */
export const DEFAULT_HUMIDITY_PERCENT = 60

/** Moderate wind speed assumed when windSpeed is missing (m/s) */
export const DEFAULT_WIND_SPEED_MS = 3

/** Moderate ET0 assumed when et0 is missing (mm/day) */
export const DEFAULT_ET0_MM_PER_DAY = 3

/** Moderate temperature max assumed when temperatureMax is missing (Celsius) */
export const DEFAULT_TEMPERATURE_MAX_C = 20

/** Moderate temperature min assumed when temperatureMin is missing (Celsius) */
export const DEFAULT_TEMPERATURE_MIN_C = 10

// ─── Weather Factor Multipliers ──────────────────────────────────────────────

// Temperature factors (outdoor)
export const TEMP_FACTOR_HEAT_WAVE = 1.5
export const TEMP_FACTOR_HOT_DAY = 1.2
export const TEMP_FACTOR_COLD_DAY = 0.5

// Temperature factors (indoor dampening)
export const TEMP_FACTOR_INDOOR_HEAT_WAVE = 1.15
export const TEMP_FACTOR_INDOOR_HOT_DAY = 1.1
export const TEMP_FACTOR_INDOOR_COLD_DAY = 0.85

// Humidity factors
export const HUMIDITY_FACTOR_HIGH = 0.85
export const HUMIDITY_FACTOR_LOW = 1.15

// Wind factors
export const WIND_FACTOR_HIGH = 1.1
export const WIND_FACTOR_LOW = 0.9

// Precipitation dampening for heavy rain days
export const PRECIP_DAMPENING_FACTOR = 0.3

// Consecutive hot days required to trigger heat wave
export const HEAT_WAVE_CONSECUTIVE_DAYS = 3

// Neutral factor (no adjustment)
export const FACTOR_NEUTRAL = 1.0

// ─── Crop Coefficient Lookup ─────────────────────────────────────────────────

/**
 * Look up the crop coefficient (Kc) for a plant.
 *
 * WHAT IS Kc?
 *   The crop coefficient is the ratio of a specific crop's water use to the
 *   water use of a standardized reference grass surface. It captures how a
 *   plant's physical characteristics (leaf area, stomatal behavior, root
 *   depth, growth stage) affect its water consumption relative to the
 *   reference.
 *
 * WHY DO DIFFERENT PLANTS HAVE DIFFERENT Kc VALUES?
 *   - Succulents/Cacti (Kc = 0.2): Use CAM photosynthesis -- they open their
 *     stomata at night (when it's cool) and close them during the day,
 *     resulting in minimal daytime transpiration. Thick, waxy cuticles
 *     further reduce water loss.
 *   - Tropical plants (Kc = 1.0): Large leaf area with high transpiration
 *     rates. Many tropical species have thin, broad leaves optimized for
 *     light capture in canopy environments, which also means high water loss.
 *   - Trees (Kc = 1.1): Deep root systems and large canopies mean high
 *     overall water consumption, though per-leaf-area rates may be moderate.
 *   - Aquatic plants (Kc = 1.2): Adapted to waterlogged conditions, these
 *     plants transpire freely and often have high stomatal conductance.
 *
 * HOW DOES wateringRating MODIFY Kc?
 *   The wateringRating (1-5 scale) is a user-facing indicator of how much
 *   water a plant needs. We use it as a secondary modifier:
 *   rating 1 = very low water needs -> multiply Kc by 0.7
 *   rating 3 = average -> multiply Kc by 1.0
 *   rating 5 = very high water needs -> multiply Kc by 1.3
 *   This linear interpolation gives: modifier = 0.7 + (rating - 1) * 0.15
 *
 * Source: FAO-56 Paper, Chapter 6 -- "ETc - Single crop coefficient"
 */
export function getCropCoefficient(
  category: string | null,
  wateringRating: number
): number {
  const baseKc = pipe(
    Option.fromNullable(category),
    Option.flatMap((cat) => Option.fromNullable(CROP_COEFFICIENTS[cat])),
    Option.getOrElse(() => DEFAULT_KC)
  )

  // wateringRating modifier: 1->0.7, 2->0.85, 3->1.0, 4->1.15, 5->1.3
  const ratingModifier =
    RATING_MODIFIER_BASE + (wateringRating - 1) * RATING_MODIFIER_STEP

  return baseKc * ratingModifier
}
