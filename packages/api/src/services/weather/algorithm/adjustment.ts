/**
 * Care adjustment calculation functions.
 *
 * Contains the precipitation/fertilization skip checks, the frequency
 * clamping logic, and the two main public entry points:
 *   - calculatePlantAdjustment (single-snapshot adjustments)
 *   - calculateScheduleDelta   (forecast-averaged schedule deltas)
 *
 * Primary reference: FAO Irrigation and Drainage Paper No. 56 (FAO-56)
 *   Additional sources:
 *   - Colorado State Extension: "Irrigation scheduling: the water balance approach"
 *   - Simple Lawn Solutions: fertilizer timing guide
 */

import {
  DEFAULT_ET0_MM_PER_DAY,
  DEFAULT_TEMPERATURE_MAX_C,
  DEFAULT_TEMPERATURE_MIN_C,
  getCropCoefficient,
  MS_PER_DAY,
  PRECIP_DAMPENING_FACTOR,
} from '@lily/api/services/weather/algorithm/coefficients'
import {
  calculateETc,
  calculateHumidityFactor,
  calculateTemperatureFactor,
  calculateWindFactor,
} from '@lily/api/services/weather/algorithm/et0'
import type { WeatherContext } from '@lily/api/services/weather/helpers/get-weather-context'
import type { CareAdjustment, WeatherData } from '@lily/shared'
import { PRECIP_SKIP_MM, TEMP_FERT_HIGH_C, TEMP_FERT_LOW_C } from '@lily/shared'
import { Array, Match, Option, pipe } from 'effect'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PlantForAdjustment {
  readonly id: string
  readonly category: string | null
  readonly wateringFrequencyDays: number
  readonly wateringRating: number
  readonly isOutdoor: boolean
}

export interface PlantForScheduleDelta {
  readonly id: string
  readonly category: string | null
  readonly wateringFrequencyDays: number
  readonly wateringRating: number
  readonly isOutdoor: boolean
  readonly lastWateredAt: Date
  readonly nextWateringAt: Date
  readonly nextFertilizationAt: Date | null
  readonly fertilizationFrequencyDays: number | null
}

export interface ScheduleDelta {
  readonly wateringDaysDelta: number
  readonly wateringReason?: string
  readonly fertilizationDaysDelta: number
  readonly fertilizationReason?: string
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
 *   deep enough to reach root zones -- water is intercepted by foliage and
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
 * Source: Colorado State Extension -- "Irrigation scheduling: the water
 *   balance approach"
 */
function checkPrecipitationSkip(
  currentWeather: WeatherData,
  forecast: ReadonlyArray<WeatherData>,
  isOutdoor: boolean
): { skip: boolean; reason?: string } {
  // Indoor plants don't benefit from rainfall -- never skip watering
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
 *     1.2 (hot) x 1.15 (dry) x 1.1 (windy) = 1.518x
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
 *   - Maximum 2x original: Even in ideal conditions (cold, humid, no wind),
 *     don't extend more than double the base schedule. This prevents a plant
 *     set to every-7-days from being pushed to every-28-days in a cold snap.
 *
 * ROUNDING:
 *   Math.round for the nearest integer day, since the care system doesn't
 *   support sub-day scheduling.
 */
function computeAdjustedFrequency(
  originalDays: number,
  multiplier: number
): number {
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
 * HEAT STRESS (>30C / 86F):
 *   At high temperatures, root uptake efficiency drops significantly.
 *   Fertilizer salts create osmotic stress in the root zone -- they draw
 *   water away from roots (the "salt effect"). Combined with heat-induced
 *   water stress, this can cause root burn, leaf scorch, and in severe
 *   cases, plant death. The plant is already struggling to maintain water
 *   balance; adding fertilizer salts makes it worse.
 *   Source: Simple Lawn Solutions -- fertilizer timing guide
 *
 * COLD DORMANCY (<5C / 41F):
 *   At low temperatures, most plants enter dormancy or semi-dormancy. Their
 *   metabolic rate drops dramatically, and roots cannot actively absorb
 *   nutrients. Fertilizer accumulates in the soil as unused salts, which can
 *   cause salt buildup that damages roots when the plant resumes growth.
 *   Source: Oregon State Extension -- environmental factors
 *
 * IDEAL WINDOW (not enforced, informational):
 *   The ideal fertilization temperature range is 15-24C (60-75F), when
 *   root activity is high and nutrient uptake is efficient. We don't enforce
 *   this; we only block the dangerous extremes.
 *
 * FUTURE ENHANCEMENT:
 *   Could add a "fertilization effectiveness score" (0-1) rather than a
 *   binary skip, allowing partial fertilization in marginal conditions.
 */
function checkFertilizationSkip(currentWeather: WeatherData): {
  skip: boolean
  reason?: string
} {
  const tempMax = pipe(
    Option.fromNullable(currentWeather.temperatureMax),
    Option.getOrElse(() => DEFAULT_TEMPERATURE_MAX_C)
  )

  const tempMin = pipe(
    Option.fromNullable(currentWeather.temperatureMin),
    Option.getOrElse(() => DEFAULT_TEMPERATURE_MIN_C)
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
export function calculatePlantAdjustment(
  plant: PlantForAdjustment,
  currentWeather: WeatherData,
  recentHistory: ReadonlyArray<WeatherData>,
  forecast: ReadonlyArray<WeatherData> = []
): CareAdjustment {
  // Step 1: Determine crop coefficient
  const kc = getCropCoefficient(plant.category, plant.wateringRating)

  // Step 2: Calculate actual crop ET (for factors output)
  const et0Value = pipe(
    Option.fromNullable(currentWeather.et0),
    Option.getOrElse(() => DEFAULT_ET0_MM_PER_DAY)
  )
  const _etc = calculateETc(et0Value, kc)

  // Step 3: Temperature factor (dampened for indoor plants)
  const temperatureFactor = calculateTemperatureFactor(
    currentWeather,
    recentHistory,
    plant.isOutdoor
  )

  // Step 4: Humidity factor (neutral for indoor plants)
  const humidityFactor = calculateHumidityFactor(
    currentWeather,
    plant.isOutdoor
  )

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

// ─── Schedule Delta (Forecast-Averaged Gate Model) ──────────────────────────

/**
 * Calculate the per-day weather multiplier for a single forecast day.
 *
 * For outdoor plants, all factors apply at full strength, plus precipitation
 * dampening (heavy rain day -> plant was watered by nature).
 *
 * For indoor plants, temperature is dampened, humidity and wind are neutral,
 * and precipitation is excluded entirely.
 */
function calculateDayMultiplier(
  day: WeatherData,
  recentHistory: ReadonlyArray<WeatherData>,
  isOutdoor: boolean
): number {
  const tempFactor = calculateTemperatureFactor(day, recentHistory, isOutdoor)
  const humFactor = calculateHumidityFactor(day, isOutdoor)
  const windFactor = calculateWindFactor(day, isOutdoor)

  let multiplier = tempFactor * humFactor * windFactor

  // Precipitation dampening for outdoor plants only
  if (isOutdoor) {
    const precip = pipe(
      Option.fromNullable(day.precipitation),
      Option.getOrElse(() => 0)
    )
    // Heavy rain (>6mm): plant was watered by nature -- only 30% of normal demand
    if (precip > PRECIP_SKIP_MM) {
      multiplier = multiplier * PRECIP_DAMPENING_FACTOR
    }
  }

  return multiplier
}

/**
 * Calculate how many days to shift a plant's watering and fertilization
 * schedule based on the full weather forecast.
 *
 * This is the core scheduler function. Instead of recalculating
 * `nextWateringAt = lastWateredAt + adjustedDays` from scratch each run
 * (which causes jitter and runaway delays), it computes a stable DELTA:
 *
 *   1. Average per-day multipliers across the entire forecast
 *   2. Compute ideal adjusted frequency from that average
 *   3. Derive `idealNext = lastWateredAt + adjustedDays`
 *   4. Delta = round((idealNext - currentNext) / oneDay)
 *   5. Cap the delta to prevent extreme swings
 *
 * The result is a small integer (+2, -1, 0, etc.) that the scheduler adds
 * to the current `nextWateringAt`. Re-running with the same weather produces
 * delta = 0 (no jitter).
 */
export function calculateScheduleDelta(
  plant: PlantForScheduleDelta,
  weatherCtx: WeatherContext,
  nowMs: number
): ScheduleDelta {
  const { forecast, recentHistory } = weatherCtx

  // Empty forecast -> no data to act on -> no change
  if (Array.isEmptyReadonlyArray(forecast)) {
    return { wateringDaysDelta: 0, fertilizationDaysDelta: 0 }
  }

  // Compute per-day multipliers and average them
  const dayMultipliers = Array.map(forecast, (day) =>
    calculateDayMultiplier(day, recentHistory, plant.isOutdoor)
  )

  const avgMultiplier = pipe(
    Array.reduce(dayMultipliers, 0, (acc, m) => acc + m),
    (sum) => sum / Array.length(dayMultipliers)
  )

  // Compute adjusted frequency from the averaged multiplier
  const adjustedDays = computeAdjustedFrequency(
    plant.wateringFrequencyDays,
    avgMultiplier
  )

  // idealNext = lastWateredAt + adjustedDays
  const lastWateredMs = plant.lastWateredAt.getTime()
  const oneDayMs = MS_PER_DAY
  const idealNextMs = lastWateredMs + adjustedDays * oneDayMs

  // currentNext = plant.nextWateringAt
  const currentNextMs = plant.nextWateringAt.getTime()

  // Raw delta in days
  const rawDelta = Math.round((idealNextMs - currentNextMs) / oneDayMs)

  // Cap: max delay = ceil(baseFrequency / 2)
  const maxDelay = Math.ceil(plant.wateringFrequencyDays / 2)
  // Cap: max acceleration = -(baseFrequency / 2), but newNext must not be before
  // now or lastWateredAt + 1 day
  const maxAcceleration = -maxDelay

  let cappedDelta = Math.max(maxAcceleration, Math.min(rawDelta, maxDelay))

  // Ensure newNextWateringAt is not before now or lastWateredAt + 1 day
  const newNextMs = currentNextMs + cappedDelta * oneDayMs
  const minNextMs = Math.max(nowMs, lastWateredMs + oneDayMs)
  if (newNextMs < minNextMs) {
    cappedDelta = Math.round((minNextMs - currentNextMs) / oneDayMs)
    // If the cap pushes us to zero or positive, just use 0
    if (cappedDelta >= 0 && rawDelta < 0) {
      cappedDelta = 0
    }
  }

  // Only apply if |delta| >= 1
  const wateringDaysDelta = Math.abs(cappedDelta) >= 1 ? cappedDelta : 0

  // Build reason string
  const wateringReason = pipe(
    Match.value(wateringDaysDelta),
    Match.when(
      (d: number) => d > 0,
      (d) =>
        `Forecast avg multiplier ${avgMultiplier.toFixed(2)} → delay ${d}d (adjusted ${adjustedDays}d vs base ${plant.wateringFrequencyDays}d)`
    ),
    Match.when(
      (d: number) => d < 0,
      (d) =>
        `Forecast avg multiplier ${avgMultiplier.toFixed(2)} → accelerate ${d}d (adjusted ${adjustedDays}d vs base ${plant.wateringFrequencyDays}d)`
    ),
    Match.orElse(() => undefined)
  )

  // --- Fertilization delta ---
  // Only push by +1 day if fertilization is due/overdue AND conditions are extreme
  const fertCheck = pipe(
    Array.head(forecast),
    Option.map((day) => checkFertilizationSkip(day)),
    Option.getOrElse(
      () => ({ skip: false }) as { skip: boolean; reason?: string }
    )
  )

  let fertilizationDaysDelta = 0
  let fertilizationReason: string | undefined

  if (
    plant.nextFertilizationAt &&
    plant.nextFertilizationAt.getTime() <= nowMs &&
    fertCheck.skip
  ) {
    fertilizationDaysDelta = 1
    fertilizationReason = fertCheck.reason
  }

  return {
    wateringDaysDelta,
    ...(wateringReason ? { wateringReason } : {}),
    fertilizationDaysDelta,
    ...(fertilizationReason ? { fertilizationReason } : {}),
  }
}
