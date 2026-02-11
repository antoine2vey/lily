/**
 * Care Adjustment Algorithm — Evapotranspiration-based plant care scheduling
 *
 * This module contains pure functions (no side effects, no dependencies) that
 * calculate how weather conditions should modify a plant's watering and
 * fertilization schedule.
 *
 * The core concept is Evapotranspiration (ET): the combined process of water
 * evaporating from the soil surface and transpiring through plant stomata
 * (tiny pores on leaves that open to exchange gases for photosynthesis).
 *
 * Primary reference: FAO Irrigation and Drainage Paper No. 56 (FAO-56)
 *   "Crop evapotranspiration - Guidelines for computing crop water requirements"
 *   Allen, R.G., Pereira, L.S., Raes, D. and Smith, M. (1998)
 *   https://www.fao.org/4/x0490e/x0490e00.htm
 *
 * Additional sources:
 *   - MSU Extension: "What is evapotranspiration and why it matters"
 *   - Colorado State Extension: "Irrigation scheduling: the water balance approach"
 *   - NC Climate Office: "Four weather factors for plant growth"
 */

import type { CareAdjustment, WeatherData } from '@lily/shared'
import {
  CROP_COEFFICIENTS,
  DEFAULT_KC,
  HUMIDITY_HIGH,
  HUMIDITY_LOW,
  PRECIP_SKIP_MM,
  TEMP_FERT_HIGH_C,
  TEMP_FERT_LOW_C,
  TEMP_HIGH_C,
  TEMP_LOW_C,
  WIND_HIGH,
  WIND_LOW,
} from '@lily/shared'
import { Array, Match, Option, pipe } from 'effect'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PlantForAdjustment {
  readonly id: string
  readonly category: string | null
  readonly wateringFrequencyDays: number
  readonly wateringRating: number
  readonly isOutdoor: boolean
}

// ─── Step 1: Crop Coefficient (Kc) ──────────────────────────────────────────

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
 *   - Succulents/Cacti (Kc = 0.2): Use CAM photosynthesis — they open their
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
 *   rating 1 = very low water needs → multiply Kc by 0.7
 *   rating 3 = average → multiply Kc by 1.0
 *   rating 5 = very high water needs → multiply Kc by 1.3
 *   This linear interpolation gives: modifier = 0.7 + (rating - 1) * 0.15
 *
 * Source: FAO-56 Paper, Chapter 6 — "ETc - Single crop coefficient"
 */
const getCropCoefficient = (
  category: string | null,
  wateringRating: number
): number => {
  const baseKc = pipe(
    Option.fromNullable(category),
    Option.flatMap((cat) => Option.fromNullable(CROP_COEFFICIENTS[cat])),
    Option.getOrElse(() => DEFAULT_KC)
  )

  // wateringRating modifier: 1→0.7, 2→0.85, 3→1.0, 4→1.15, 5→1.3
  const ratingModifier = 0.7 + (wateringRating - 1) * 0.15

  return baseKc * ratingModifier
}

// ─── Step 2: Actual Crop ET (ETc) ───────────────────────────────────────────

/**
 * Calculate actual crop evapotranspiration: ETc = ET0 × Kc
 *
 * WHAT IS ET0 (Reference Evapotranspiration)?
 *   ET0 is the rate of water loss from a standardized reference surface — a
 *   hypothetical grass crop 12cm tall, actively growing, completely shading
 *   the ground, and with adequate water. It is computed from weather data
 *   using the Penman-Monteith equation (FAO-56, equation 6), which takes as
 *   inputs: temperature, humidity, wind speed, and solar radiation.
 *
 *   We use the ET0 value directly from the Open-Meteo API, which computes it
 *   using the full Penman-Monteith equation with satellite-derived radiation
 *   models. This is more accurate than computing it ourselves.
 *
 * WHAT IS ETc (Crop Evapotranspiration)?
 *   ETc is the actual water need for THIS specific plant. By multiplying ET0
 *   by the crop coefficient Kc, we scale the reference water loss to match
 *   the plant's real transpiration characteristics.
 *
 * UNIT: mm/day means "millimeters of water depth that evapotranspires per
 *   day." Practically, 1mm of ET over 1m² of area = 1 liter of water lost.
 *
 * Source: FAO-56, Allen et al. 1998, Chapter 6
 */
const calculateETc = (et0: number, kc: number): number => et0 * kc

// ─── Step 3: Temperature Factor ─────────────────────────────────────────────

/**
 * Calculate the temperature adjustment factor.
 *
 * HOW HEAT INCREASES WATER NEEDS:
 *   At higher temperatures, the vapor pressure deficit (VPD) between the
 *   inside of the leaf and the surrounding air increases. This steeper
 *   gradient drives faster transpiration through open stomata. Plants also
 *   use evaporative cooling (like sweating) — water evaporates from leaf
 *   surfaces, cooling the plant, which increases water consumption.
 *
 * WHY CONSECUTIVE HOT DAYS MATTER MORE THAN A SINGLE HOT DAY:
 *   Soil acts as a moisture reservoir. A single hot day depletes some
 *   moisture, but the reservoir can often buffer it. After 3+ consecutive
 *   hot days, the soil reservoir is progressively depleted — there is no
 *   overnight recovery because nighttime temperatures also remain elevated
 *   (urban heat island effect, warm air masses). The plant enters cumulative
 *   stress, requiring significantly more water.
 *
 * THE 85°F (29.4°C) THRESHOLD:
 *   Agricultural extension research (MSU Extension, NC Climate Office) shows
 *   that most plants exhibit measurable stress responses above 85°F. This is
 *   a widely-used benchmark in horticultural guidance.
 *
 * WHY COLD REDUCES NEEDS:
 *   Below ~60°F (15.6°C), plant metabolic rates drop. Stomata partially
 *   close, reducing transpiration. Root uptake slows. The plant simply uses
 *   less water. Source: Oregon State Extension on environmental factors.
 *
 * MULTIPLIER VALUES:
 *   - 1.5x for heat waves (3+ consecutive hot days): Container and potted
 *     plants may need up to 2x water at >90°F. 1.5x is a conservative
 *     general-purpose value. Source: Plantin watering guide.
 *   - 1.2x for a single hot day: Moderate increase, as the soil reservoir
 *     can still buffer some of the extra demand.
 *   - 0.5x for cold: Plant uses roughly half the water when dormancy signals
 *     begin.
 */
const calculateTemperatureFactor = (
  currentWeather: WeatherData,
  recentHistory: ReadonlyArray<WeatherData>
): number => {
  // Count consecutive hot days in recent history (most recent first)
  const consecutiveHotDays = pipe(
    recentHistory,
    Array.takeWhile(
      (day) => day.temperatureMax !== null && day.temperatureMax > TEMP_HIGH_C
    ),
    Array.length
  )

  const currentMean = pipe(
    Option.fromNullable(currentWeather.temperatureMean),
    Option.getOrElse(() => 20) // Assume moderate if missing
  )

  return pipe(
    Match.value({ consecutiveHotDays, currentMean }),
    // 3+ consecutive hot days → heat wave, 50% more water needed
    Match.when({ consecutiveHotDays: (d: number) => d >= 3 }, () => 1.5),
    // Single hot day (today) → moderate increase
    Match.when({ currentMean: (t: number) => t > TEMP_HIGH_C }, () => 1.2),
    // Cold day → reduced needs
    Match.when({ currentMean: (t: number) => t < TEMP_LOW_C }, () => 0.5),
    // Normal temperature range
    Match.orElse(() => 1.0)
  )
}

// ─── Step 4: Humidity Factor ────────────────────────────────────────────────

/**
 * Calculate the humidity adjustment factor.
 *
 * WHAT IS RELATIVE HUMIDITY?
 *   Relative humidity (RH) is the ratio of the actual amount of water vapor
 *   in the air to the maximum amount the air could hold at that temperature.
 *   Warm air can hold more moisture than cold air, so 50% RH at 30°C
 *   contains more water vapor than 50% RH at 10°C.
 *
 * HOW IT AFFECTS TRANSPIRATION (Fick's Law of Diffusion):
 *   Water moves from inside the leaf (near 100% RH in the stomatal cavity)
 *   to the surrounding air. The driving force is the vapor pressure gradient
 *   — the difference between the humidity inside and outside the leaf.
 *
 *   - HIGH humidity (>80%): The air is already moisture-rich, so the gradient
 *     is small. Transpiration slows because water molecules don't "want" to
 *     move into already-humid air. Result: the plant loses water more slowly
 *     and needs less irrigation.
 *
 *   - LOW humidity (<50%): Dry air creates a steep gradient. Water is pulled
 *     from leaves rapidly (higher vapor pressure deficit / VPD). The plant
 *     loses water faster and needs more irrigation.
 *
 * CAUTION (not implemented yet, potential future feature):
 *   High humidity + warm temperatures = increased fungal risk. In such
 *   conditions, watering in the morning (to allow foliage drying) is
 *   preferable to evening watering.
 *
 * Source: FAO-56 Chapter 3 on meteorological factors affecting ET
 */
const calculateHumidityFactor = (currentWeather: WeatherData): number => {
  const humidity = pipe(
    Option.fromNullable(currentWeather.humidity),
    Option.getOrElse(() => 60) // Assume moderate if missing
  )

  return pipe(
    Match.value(humidity),
    // High humidity → 15% less water needed (slower transpiration)
    Match.when(
      (h: number) => h > HUMIDITY_HIGH,
      () => 0.85
    ),
    // Low humidity → 15% more water needed (faster transpiration)
    Match.when(
      (h: number) => h < HUMIDITY_LOW,
      () => 1.15
    ),
    // Normal humidity range
    Match.orElse(() => 1.0)
  )
}

// ─── Step 5: Wind Factor ────────────────────────────────────────────────────

/**
 * Calculate the wind speed adjustment factor.
 *
 * HOW WIND AFFECTS EVAPOTRANSPIRATION:
 *   Every leaf has a thin layer of humid, still air around it called the
 *   "boundary layer." This layer acts as a buffer, slowing transpiration
 *   because the air immediately around the leaf is already moist.
 *
 *   Wind disrupts and replaces this boundary layer with drier air from the
 *   environment. This increases the vapor pressure gradient at the leaf
 *   surface, accelerating transpiration.
 *
 *   The Penman-Monteith equation (FAO-56) includes wind speed at 2m height
 *   (u2) as a key variable for exactly this reason.
 *
 * WHY THE EFFECT IS SMALLER THAN TEMPERATURE/HUMIDITY (±10% vs ±15-50%):
 *   For potted and indoor plants (Lily's primary use case), wind exposure is
 *   significantly less than for field crops. Most houseplants are sheltered
 *   by walls, windows, and other structures. The ±10% adjustment reflects
 *   this reduced impact compared to open-field agriculture.
 *
 * WIND SPEED REFERENCE:
 *   5 m/s ≈ 11 mph ≈ moderate breeze on the Beaufort scale (category 4)
 *   2 m/s ≈ 4.5 mph ≈ light breeze (category 2)
 *
 * Source: FAO-56 equation parameterization, wind speed at 2m height
 */
const calculateWindFactor = (
  currentWeather: WeatherData,
  isOutdoor: boolean
): number => {
  // Indoor plants are sheltered from wind — no adjustment needed
  if (!isOutdoor) return 1.0

  const windSpeed = pipe(
    Option.fromNullable(currentWeather.windSpeed),
    Option.getOrElse(() => 3) // Assume moderate if missing
  )

  return pipe(
    Match.value(windSpeed),
    // Strong wind → 10% more water needed (boundary layer disruption)
    Match.when(
      (w: number) => w > WIND_HIGH,
      () => 1.1
    ),
    // Light wind → 10% less water needed (boundary layer intact)
    Match.when(
      (w: number) => w < WIND_LOW,
      () => 0.9
    ),
    // Moderate wind
    Match.orElse(() => 1.0)
  )
}

// ─── Step 6: Precipitation Check ────────────────────────────────────────────

/**
 * Check whether precipitation should cause watering to be skipped.
 *
 * WHY PRECIPITATION TRIGGERS A SKIP RATHER THAN A MULTIPLIER:
 *   Rain provides direct water input that replaces irrigation entirely. This
 *   is fundamentally different from temperature or humidity, which modify how
 *   FAST a plant consumes water. Rain adds water to the system, so it's a
 *   binary decision: enough rain fell (or will fall) to skip watering.
 *
 * THE 6mm THRESHOLD:
 *   Approximately 0.25 inches of rain. This is the standard "effective
 *   rainfall" threshold used in irrigation scheduling (Colorado State
 *   Extension, water balance method). Below 6mm, rainfall may not penetrate
 *   deep enough to reach root zones — water is intercepted by foliage and
 *   mulch, or evaporates from the soil surface before soaking in.
 *
 * WHY WE ALSO CHECK TOMORROW'S FORECAST:
 *   Proactively skipping watering before rain arrives avoids overwatering.
 *   The 1-day lookahead is standard in smart irrigation controllers (e.g.,
 *   Weathermatic ET-based systems). We only look 1 day ahead because
 *   forecast accuracy decreases significantly beyond 24-48 hours.
 *
 * INDOOR vs OUTDOOR:
 *   Indoor plants don't benefit from rainfall, so this check is skipped
 *   for plants in rooms marked as indoor (isOutdoor = false).
 *
 * Source: Colorado State Extension — "Irrigation scheduling: the water
 *   balance approach"
 */
const checkPrecipitationSkip = (
  currentWeather: WeatherData,
  forecast: ReadonlyArray<WeatherData>,
  isOutdoor: boolean
): { skip: boolean; reason?: string } => {
  // Indoor plants don't benefit from rainfall — never skip watering
  if (!isOutdoor) return { skip: false }

  const currentPrecip = pipe(
    Option.fromNullable(currentWeather.precipitation),
    Option.getOrElse(() => 0)
  )

  if (currentPrecip > PRECIP_SKIP_MM) {
    return {
      skip: true,
      reason: `Recent rainfall of ${currentPrecip}mm exceeds ${PRECIP_SKIP_MM}mm threshold`,
    }
  }

  // Check tomorrow's forecast (index 1 if available)
  const tomorrowPrecip = pipe(
    Array.get(forecast, 1),
    Option.flatMap((day) => Option.fromNullable(day.precipitation)),
    Option.getOrElse(() => 0)
  )

  if (tomorrowPrecip > PRECIP_SKIP_MM) {
    return {
      skip: true,
      reason: `Forecast: ${tomorrowPrecip}mm rain expected tomorrow (>${PRECIP_SKIP_MM}mm)`,
    }
  }

  return { skip: false }
}

// ─── Step 7: Combined Watering Multiplier ───────────────────────────────────

/**
 * Combine individual factors into a single watering multiplier and compute
 * the adjusted watering frequency in days.
 *
 * WHY MULTIPLICATIVE COMBINATION:
 *   Environmental factors compound each other. A hot, dry, windy day has a
 *   much greater effect than any single factor alone:
 *     1.2 (hot) × 1.15 (dry) × 1.1 (windy) = 1.518x
 *   An additive model would give: 1 + 0.2 + 0.15 + 0.1 = 1.45, which
 *   underestimates the compounding stress.
 *
 * WHY WE DIVIDE FREQUENCY BY THE MULTIPLIER:
 *   If the multiplier is 1.5 (plant needs 50% more water), watering should
 *   happen MORE OFTEN. Since frequency is expressed in days between waterings,
 *   a higher water need means fewer days between waterings:
 *     7 days / 1.5 = ~5 days (water more often)
 *     7 days / 0.5 = 14 days (water less often)
 *
 * WHY WE CLAMP:
 *   Safety bounds prevent absurd schedules:
 *   - Minimum 1 day: Can't water more than daily in the current system.
 *   - Maximum 2× original: Even in ideal conditions (cold, humid, no wind),
 *     don't extend more than double the base schedule. This prevents a plant
 *     set to every-7-days from being pushed to every-28-days in a cold snap.
 *
 * ROUNDING:
 *   Math.round for the nearest integer day, since the care system doesn't
 *   support sub-day scheduling.
 */
const computeAdjustedFrequency = (
  originalDays: number,
  multiplier: number
): number => {
  const adjusted = Math.round(originalDays / multiplier)
  return Math.max(1, Math.min(adjusted, originalDays * 2))
}

// ─── Step 8: Fertilization Check ────────────────────────────────────────────

/**
 * Determine whether fertilization should be skipped based on temperature.
 *
 * WHY FERTILIZATION IS BINARY (skip/don't skip) RATHER THAN A MULTIPLIER:
 *   Unlike water, which plants always need in varying amounts, fertilizer
 *   during extreme temperatures causes active HARM rather than just being
 *   less effective.
 *
 * HEAT STRESS (>30°C / 86°F):
 *   At high temperatures, root uptake efficiency drops significantly.
 *   Fertilizer salts create osmotic stress in the root zone — they draw
 *   water away from roots (the "salt effect"). Combined with heat-induced
 *   water stress, this can cause root burn, leaf scorch, and in severe
 *   cases, plant death. The plant is already struggling to maintain water
 *   balance; adding fertilizer salts makes it worse.
 *   Source: Simple Lawn Solutions — fertilizer timing guide
 *
 * COLD DORMANCY (<5°C / 41°F):
 *   At low temperatures, most plants enter dormancy or semi-dormancy. Their
 *   metabolic rate drops dramatically, and roots cannot actively absorb
 *   nutrients. Fertilizer accumulates in the soil as unused salts, which can
 *   cause salt buildup that damages roots when the plant resumes growth.
 *   Source: Oregon State Extension — environmental factors
 *
 * IDEAL WINDOW (not enforced, informational):
 *   The ideal fertilization temperature range is 15-24°C (60-75°F), when
 *   root activity is high and nutrient uptake is efficient. We don't enforce
 *   this; we only block the dangerous extremes.
 *
 * FUTURE ENHANCEMENT:
 *   Could add a "fertilization effectiveness score" (0-1) rather than a
 *   binary skip, allowing partial fertilization in marginal conditions.
 */
const checkFertilizationSkip = (
  currentWeather: WeatherData
): { skip: boolean; reason?: string } => {
  const tempMax = pipe(
    Option.fromNullable(currentWeather.temperatureMax),
    Option.getOrElse(() => 20)
  )

  const tempMin = pipe(
    Option.fromNullable(currentWeather.temperatureMin),
    Option.getOrElse(() => 10)
  )

  if (tempMax > TEMP_FERT_HIGH_C) {
    return {
      skip: true,
      reason: `Temperature too high (${tempMax}°C > ${TEMP_FERT_HIGH_C}°C) — risk of root burn from fertilizer salt stress`,
    }
  }

  if (tempMin < TEMP_FERT_LOW_C) {
    return {
      skip: true,
      reason: `Temperature too low (${tempMin}°C < ${TEMP_FERT_LOW_C}°C) — plant in dormancy, cannot absorb nutrients`,
    }
  }

  return { skip: false }
}

// ─── Main Algorithm ─────────────────────────────────────────────────────────

/**
 * Calculate weather-based care adjustments for a single plant.
 *
 * @param plant - Plant data with category, watering frequency, and water rating
 * @param currentWeather - Today's weather data
 * @param recentHistory - Last 3-7 days of weather data (most recent first)
 * @param forecast - Forecast data (today + upcoming days)
 * @returns CareAdjustment with multipliers, adjusted days, and skip flags
 */
export const calculatePlantAdjustment = (
  plant: PlantForAdjustment,
  currentWeather: WeatherData,
  recentHistory: ReadonlyArray<WeatherData>,
  forecast: ReadonlyArray<WeatherData> = []
): CareAdjustment => {
  // Step 1: Determine crop coefficient
  const kc = getCropCoefficient(plant.category, plant.wateringRating)

  // Step 2: Calculate actual crop ET (for factors output)
  const et0Value = pipe(
    Option.fromNullable(currentWeather.et0),
    Option.getOrElse(() => 3) // ~3mm/day is a moderate default
  )
  const _etc = calculateETc(et0Value, kc)

  // Step 3: Temperature factor
  const temperatureFactor = calculateTemperatureFactor(
    currentWeather,
    recentHistory
  )

  // Step 4: Humidity factor
  const humidityFactor = calculateHumidityFactor(currentWeather)

  // Step 5: Wind factor (skipped for indoor plants)
  const windFactor = calculateWindFactor(currentWeather, plant.isOutdoor)

  // Step 6: Precipitation check (skipped for indoor plants)
  const precipCheck = checkPrecipitationSkip(
    currentWeather,
    forecast,
    plant.isOutdoor
  )

  // Step 7: Combined multiplier and adjusted frequency
  const combinedMultiplier = temperatureFactor * humidityFactor * windFactor
  const adjustedDays = computeAdjustedFrequency(
    plant.wateringFrequencyDays,
    combinedMultiplier
  )

  // Step 8: Fertilization check
  const fertCheck = checkFertilizationSkip(currentWeather)

  return {
    plantId: plant.id,
    wateringMultiplier: Math.round(combinedMultiplier * 100) / 100,
    adjustedWateringDays: adjustedDays,
    skipWatering: precipCheck.skip,
    ...(precipCheck.reason ? { skipWateringReason: precipCheck.reason } : {}),
    skipFertilization: fertCheck.skip,
    ...(fertCheck.reason ? { skipFertilizationReason: fertCheck.reason } : {}),
    factors: {
      temperature: temperatureFactor,
      humidity: humidityFactor,
      wind: windFactor,
      precipitation: pipe(
        Option.fromNullable(currentWeather.precipitation),
        Option.getOrElse(() => 0)
      ),
      et0: et0Value,
    },
  }
}
