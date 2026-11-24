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
  calculateHumidityFactor,
  calculateTemperatureFactor,
  calculateWindFactor,
} from '@lily/api/services/weather/algorithm/et0'
import type { WeatherContext } from '@lily/api/services/weather/helpers/get-weather-context'
import type { CareAdjustment, Orientation, WeatherData } from '@lily/shared'
import { PRECIP_SKIP_MM, TEMP_FERT_HIGH_C, TEMP_FERT_LOW_C } from '@lily/shared'
import {
  adjustedWateringDays,
  calculateIndoorDemandFactor,
  DEFAULT_ET0_MM_PER_DAY,
  DEFAULT_HUMIDITY_RATING,
  DEFAULT_LIGHTING_RATING,
  DEFAULT_TEMPERATURE_MAX_C,
  DEFAULT_TEMPERATURE_MIN_C,
  type IndoorDemandInput,
  MS_PER_DAY,
  PRECIP_DAMPENING_FACTOR,
} from '@lily/shared/indoor-demand'
import { Array, Match, Option, pipe } from 'effect'

/**
 * Plant fields consumed by the indoor light/growth demand model. Optional so
 * existing callers compile unchanged; the production call sites provide them.
 * When absent (or when latitude is unknown) the indoor branch falls back to the
 * legacy temperature-dampened behaviour.
 */
export interface IndoorPlantContext {
  readonly category: string | null
  readonly isOutdoor: boolean
  readonly lightingRating?: number
  readonly humidityRating?: number
  readonly roomLuminosity?: number | null
  readonly roomOrientation?: string | null
}

export interface PlantForAdjustment extends IndoorPlantContext {
  readonly id: string
  readonly wateringFrequencyDays: number
  readonly wateringRating: number
}

export interface PlantForScheduleDelta extends IndoorPlantContext {
  readonly id: string
  readonly wateringFrequencyDays: number
  readonly wateringRating: number
  readonly lastWateredAt: Date
  readonly nextWateringAt: Date
  readonly nextFertilizationAt: Date | null
  readonly fertilizationFrequencyDays: number | null
}

/**
 * Flatten a plant + its room into the `IndoorPlantContext` shape. Owns the
 * room-field derivation (isOutdoor / luminosity / orientation) in one place so
 * the care-execution, scheduler, and preview call sites don't each repeat it.
 */
export const toIndoorPlantContext = (plant: {
  readonly category: string | null
  readonly lightingRating: number
  readonly humidityRating: number
  readonly room: {
    readonly isOutdoor: boolean
    readonly luminosity: number | null
    readonly orientation: Orientation | null
  } | null
}): IndoorPlantContext => ({
  category: plant.category,
  lightingRating: plant.lightingRating,
  humidityRating: plant.humidityRating,
  isOutdoor: pipe(
    Option.fromNullishOr(plant.room),
    Option.map((r) => r.isOutdoor),
    Option.getOrElse(() => false)
  ),
  roomLuminosity: pipe(
    Option.fromNullishOr(plant.room),
    Option.flatMap((r) => Option.fromNullishOr(r.luminosity)),
    Option.getOrNull
  ),
  roomOrientation: pipe(
    Option.fromNullishOr(plant.room),
    Option.flatMap((r) => Option.fromNullishOr(r.orientation)),
    Option.getOrNull
  ),
})

/**
 * Build the indoor demand input for a plant + weather day. Returns `None` when
 * latitude is missing/non-finite — in that case the caller uses the legacy
 * outdoor-style multiplier (the indoor model is location-aware by design).
 */
const indoorDemandInput = (
  plant: IndoorPlantContext,
  latitude: number | null,
  day: WeatherData,
  recentHistory: ReadonlyArray<WeatherData>
): Option.Option<IndoorDemandInput> =>
  pipe(
    Option.fromNullishOr(latitude),
    Option.filter((lat) => Number.isFinite(lat) && !plant.isOutdoor),
    Option.map((lat) => ({
      latitude: lat,
      day,
      recentHistory,
      category: plant.category,
      roomLuminosity: pipe(
        Option.fromNullishOr(plant.roomLuminosity),
        Option.getOrNull
      ),
      roomOrientation: pipe(
        Option.fromNullishOr(plant.roomOrientation),
        Option.getOrNull
      ),
      lightingRating: pipe(
        Option.fromNullishOr(plant.lightingRating),
        Option.getOrElse(() => DEFAULT_LIGHTING_RATING)
      ),
      humidityRating: pipe(
        Option.fromNullishOr(plant.humidityRating),
        Option.getOrElse(() => DEFAULT_HUMIDITY_RATING)
      ),
    }))
  )

export interface ScheduleDelta {
  readonly wateringDaysDelta: number
  readonly wateringReason?: string
  readonly fertilizationDaysDelta: number
  readonly fertilizationReason?: string
}

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
  if (!isOutdoor) return { skip: false }

  const currentPrecip = pipe(
    Option.fromNullishOr(currentWeather.precipitation),
    Option.getOrElse(() => 0)
  )

  if (currentPrecip > PRECIP_SKIP_MM) {
    return {
      skip: true,
      reason: `Recent rainfall of ${currentPrecip}mm exceeds ${PRECIP_SKIP_MM}mm threshold`,
    }
  }

  const tomorrowPrecip = pipe(
    Array.get(forecast, 1),
    Option.flatMap((day) => Option.fromNullishOr(day.precipitation)),
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
    Option.fromNullishOr(currentWeather.temperatureMax),
    Option.getOrElse(() => DEFAULT_TEMPERATURE_MAX_C)
  )

  const tempMin = pipe(
    Option.fromNullishOr(currentWeather.temperatureMin),
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

const rainDampening = (day: WeatherData, isOutdoor: boolean): number =>
  pipe(
    Option.fromNullishOr(day.precipitation),
    Option.filter((mm) => isOutdoor && mm > PRECIP_SKIP_MM),
    Option.match({
      onNone: () => 1,
      onSome: () => PRECIP_DAMPENING_FACTOR,
    })
  )

interface DayDemand {
  readonly temperature: number
  readonly humidity: number
  readonly wind: number
  readonly multiplier: number
}

/**
 * How much water one weather day asks of a plant, relative to a normal day.
 *
 * The temperature, humidity and wind factors multiply because they compound:
 * a hot, dry, windy day gives 1.2 x 1.15 x 1.1 = 1.518, where a sum (1.45)
 * would understate the stress. A heavy rain day waters an outdoor plant, so it
 * is dampened. Indoor plants with a known latitude take the location-aware
 * light/growth + VPD demand model instead.
 */
const dayDemand = (
  day: WeatherData,
  recentHistory: ReadonlyArray<WeatherData>,
  plant: IndoorPlantContext,
  latitude: number | null
): DayDemand => {
  const temperature = calculateTemperatureFactor(
    day,
    recentHistory,
    plant.isOutdoor
  )
  const humidity = calculateHumidityFactor(day, plant.isOutdoor)
  const wind = calculateWindFactor(day, plant.isOutdoor)
  return {
    temperature,
    humidity,
    wind,
    multiplier: pipe(
      indoorDemandInput(plant, latitude, day, recentHistory),
      Option.match({
        onNone: () =>
          temperature * humidity * wind * rainDampening(day, plant.isOutdoor),
        onSome: calculateIndoorDemandFactor,
      })
    ),
  }
}

export function calculatePlantAdjustment(
  plant: PlantForAdjustment,
  currentWeather: WeatherData,
  recentHistory: ReadonlyArray<WeatherData>,
  forecast: ReadonlyArray<WeatherData> = [],
  latitude: number | null = null
): CareAdjustment {
  const demand = dayDemand(currentWeather, recentHistory, plant, latitude)
  const precipCheck = checkPrecipitationSkip(
    currentWeather,
    forecast,
    plant.isOutdoor
  )
  const fertCheck = checkFertilizationSkip(currentWeather)

  return {
    plantId: plant.id,
    wateringMultiplier: Math.round(demand.multiplier * 100) / 100,
    adjustedWateringDays: adjustedWateringDays(
      plant.wateringFrequencyDays,
      demand.multiplier
    ),
    skipWatering: precipCheck.skip,
    ...(precipCheck.reason ? { skipWateringReason: precipCheck.reason } : {}),
    skipFertilization: fertCheck.skip,
    ...(fertCheck.reason ? { skipFertilizationReason: fertCheck.reason } : {}),
    factors: {
      temperature: demand.temperature,
      humidity: demand.humidity,
      wind: demand.wind,
      precipitation: pipe(
        Option.fromNullishOr(currentWeather.precipitation),
        Option.getOrElse(() => 0)
      ),
      et0: pipe(
        Option.fromNullishOr(currentWeather.et0),
        Option.getOrElse(() => DEFAULT_ET0_MM_PER_DAY)
      ),
    },
  }
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
  nowMs: number,
  latitude: number | null = null
): ScheduleDelta {
  const { forecast, recentHistory } = weatherCtx

  if (Array.isReadonlyArrayEmpty(forecast)) {
    return { wateringDaysDelta: 0, fertilizationDaysDelta: 0 }
  }

  const dayMultipliers = Array.map(
    forecast,
    (day) => dayDemand(day, recentHistory, plant, latitude).multiplier
  )

  const avgMultiplier = pipe(
    Array.reduce(dayMultipliers, 0, (acc, m) => acc + m),
    (sum) => sum / Array.length(dayMultipliers)
  )

  const adjustedDays = adjustedWateringDays(
    plant.wateringFrequencyDays,
    avgMultiplier
  )

  const lastWateredMs = plant.lastWateredAt.getTime()
  const oneDayMs = MS_PER_DAY
  const idealNextMs = lastWateredMs + adjustedDays * oneDayMs

  const currentNextMs = plant.nextWateringAt.getTime()

  const rawDelta = Math.round((idealNextMs - currentNextMs) / oneDayMs)

  const maxDelay = Math.ceil(plant.wateringFrequencyDays / 2)
  // Cap: max acceleration = -(baseFrequency / 2), but newNext must not be before
  // now or lastWateredAt + 1 day
  const maxAcceleration = -maxDelay

  let cappedDelta = Math.max(maxAcceleration, Math.min(rawDelta, maxDelay))

  const newNextMs = currentNextMs + cappedDelta * oneDayMs
  const minNextMs = Math.max(nowMs, lastWateredMs + oneDayMs)
  if (newNextMs < minNextMs) {
    cappedDelta = Math.round((minNextMs - currentNextMs) / oneDayMs)
    if (cappedDelta >= 0 && rawDelta < 0) {
      cappedDelta = 0
    }
  }

  const wateringDaysDelta = Math.abs(cappedDelta) >= 1 ? cappedDelta : 0

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
