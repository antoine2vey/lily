/**
 * Named constants and coefficient lookup tables for the care adjustment algorithm.
 *
 * Extracts all magic numbers into descriptive named constants so they can be
 * referenced and maintained from a single location.
 */

import { Duration } from 'effect'

// ─── Time Constants ──────────────────────────────────────────────────────────

export const MS_PER_DAY = Duration.toMillis(Duration.days(1))

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

// ─── Indoor Light/Growth Model ───────────────────────────────────────────────
// Drives the indoor watering DEMAND factor used when the user's latitude is
// known (location-aware indoor care). Every sub-factor is centered at 1.0, so
// missing data collapses to no change. Higher demand => fewer days => water
// sooner. These are horticulture judgement calls — tune from care-log feedback.

// Neutral fallbacks for plant ratings (0-100) when a field is absent
export const DEFAULT_LIGHTING_RATING = 50
export const DEFAULT_HUMIDITY_RATING = 50

// Photoperiod × solar-intensity growth term (day length fused with sun angle)
export const PHOTO_AMP = 0.22 // max seasonal swing of the light-energy term
export const PHOTO_EQUINOX_DAY_HOURS = 12 // 12h day = neutral (1.0)
export const PHOTO_DAYNORM_MIN = 0.5
export const PHOTO_DAYNORM_MAX = 1.5
export const PHOTO_REF_SOLAR_ELEVATION_DEG = 45 // noon elevation = neutral intensity
export const PHOTO_INTENSITY_MIN = 0.5
export const PHOTO_INTENSITY_MAX = 1.4
export const LIGHT_ENERGY_FACTOR_MIN = 0.8
export const LIGHT_ENERGY_FACTOR_MAX = 1.2

// Per-category photoperiod sensitivity (how strongly a category tracks season).
// Succulents/cacti go strongly dormant; tropicals stay evergreen but active.
export const PHOTO_CATEGORY_SENSITIVITY: Record<string, number> = {
  Succulent: 0.4,
  Cactus: 0.4,
  Foliage: 0.8,
  Fern: 0.8,
  Tropical: 1.0,
  Flowering: 1.0,
  Herb: 1.0,
  Vegetable: 1.0,
  Vine: 1.0,
  Aquatic: 1.0,
  Tree: 0.9,
  Grass: 0.9,
}
export const PHOTO_DEFAULT_SENSITIVITY = 0.7

// Window orientation seasonal redistribution (reuses the noon sun elevation)
export const ORIENT_AMP = 0.12
export const ORIENT_FACTOR_MIN = 0.85
export const ORIENT_FACTOR_MAX = 1.15

// Room light-fit: room luminosity level vs the plant's lighting need (1-5 each)
export const ROOMFIT_STEP = 0.06
export const ROOMFIT_FACTOR_MIN = 0.85
export const ROOMFIT_FACTOR_MAX = 1.15
// Drought-adapted (CAM) plants: a bright room may never ACCELERATE watering
export const ROOMFIT_CAM_CAP = 1.05
// Room at least 2 levels too dim for the plant => light-starvation / dormancy
export const ROOMFIT_DIM_VETO_GAP = -2

// Observed-sky correction: cloud cover (primary) / solar radiation (fallback)
export const SKY_AMP = 0.08
export const SKY_FACTOR_MIN = 0.92
export const SKY_FACTOR_MAX = 1.08
export const SKY_CLOUD_PIVOT = 50 // % cloud cover = neutral
export const SKY_CLOUD_SPAN = 50 // % cloud cover for a full swing
export const SKY_RECENT_DAYS = 3
export const SKY_SOLAR_REF = 12 // MJ/m²/day ≈ moderate, neutral
export const SKY_SOLAR_SPAN = 120

// Composite indoor light/growth bounds + dormancy threshold
export const LIGHT_GROWTH_FACTOR_MIN = 0.62
export const LIGHT_GROWTH_FACTOR_MAX = 1.32
export const LIGHT_DORMANT_THRESHOLD = 0.66 // at/below => treat as dormant

// Indoor heating-season dryness (Vapor Pressure Deficit). Cold outside => indoor
// heating on => low indoor RH => higher VPD => more water. Bounded so it can
// only LENGTHEN (never shorten) for a dormant plant (see the dormancy veto).
export const INDOOR_TEMP_C = 21 // assumed indoor air temperature
export const INDOOR_RH_BASE = 45 // %RH at the pivot outdoor temperature
export const INDOOR_RH_SLOPE = 1.5 // %RH gained per °C of outdoor warmth
export const INDOOR_RH_PIVOT_C = 15 // outdoor temp where indoor RH = base
export const INDOOR_RH_MIN = 25
export const INDOOR_RH_MAX = 55
export const VPD_REFERENCE_KPA = 1.12 // VPD that = neutral demand
export const INDOOR_VPD_AMP = 0.18
export const INDOOR_VPD_FACTOR_MIN = 0.85
export const INDOOR_VPD_FACTOR_MAX = 1.25
export const HUM_RATING_STEP = 0.12 // per humidity level away from the middle one

// Final indoor demand bounds (post dormancy veto + clamp)
export const INDOOR_DEMAND_MIN = 0.62
export const INDOOR_DEMAND_MAX = 1.4
