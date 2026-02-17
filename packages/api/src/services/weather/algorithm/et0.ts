/**
 * ET0 calculation and weather factor functions.
 *
 * Contains the individual weather factor calculations (temperature, humidity,
 * wind) that feed into the combined watering multiplier.
 *
 * Primary reference: FAO Irrigation and Drainage Paper No. 56 (FAO-56)
 *   "Crop evapotranspiration - Guidelines for computing crop water requirements"
 *   Allen, R.G., Pereira, L.S., Raes, D. and Smith, M. (1998)
 *   https://www.fao.org/4/x0490e/x0490e00.htm
 */

import {
  DEFAULT_HUMIDITY_PERCENT,
  DEFAULT_TEMPERATURE_MEAN_C,
  DEFAULT_WIND_SPEED_MS,
  FACTOR_NEUTRAL,
  HEAT_WAVE_CONSECUTIVE_DAYS,
  HUMIDITY_FACTOR_HIGH,
  HUMIDITY_FACTOR_LOW,
  TEMP_FACTOR_COLD_DAY,
  TEMP_FACTOR_HEAT_WAVE,
  TEMP_FACTOR_HOT_DAY,
  TEMP_FACTOR_INDOOR_COLD_DAY,
  TEMP_FACTOR_INDOOR_HEAT_WAVE,
  TEMP_FACTOR_INDOOR_HOT_DAY,
  WIND_FACTOR_HIGH,
  WIND_FACTOR_LOW,
} from '@lily/api/services/weather/algorithm/coefficients'
import type { WeatherData } from '@lily/shared'
import {
  HUMIDITY_HIGH,
  HUMIDITY_LOW,
  TEMP_HIGH_C,
  TEMP_LOW_C,
  WIND_HIGH,
  WIND_LOW,
} from '@lily/shared'
import { Array, Match, Option, pipe } from 'effect'

// ─── Step 2: Actual Crop ET (ETc) ───────────────────────────────────────────

/**
 * Calculate actual crop evapotranspiration: ETc = ET0 x Kc
 *
 * WHAT IS ET0 (Reference Evapotranspiration)?
 *   ET0 is the rate of water loss from a standardized reference surface -- a
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
 *   day." Practically, 1mm of ET over 1m2 of area = 1 liter of water lost.
 *
 * Source: FAO-56, Allen et al. 1998, Chapter 6
 */
export function calculateETc(et0: number, kc: number): number {
  return et0 * kc
}

// ─── Step 3: Temperature Factor ─────────────────────────────────────────────

/**
 * Calculate the temperature adjustment factor.
 *
 * HOW HEAT INCREASES WATER NEEDS:
 *   At higher temperatures, the vapor pressure deficit (VPD) between the
 *   inside of the leaf and the surrounding air increases. This steeper
 *   gradient drives faster transpiration through open stomata. Plants also
 *   use evaporative cooling (like sweating) -- water evaporates from leaf
 *   surfaces, cooling the plant, which increases water consumption.
 *
 * WHY CONSECUTIVE HOT DAYS MATTER MORE THAN A SINGLE HOT DAY:
 *   Soil acts as a moisture reservoir. A single hot day depletes some
 *   moisture, but the reservoir can often buffer it. After 3+ consecutive
 *   hot days, the soil reservoir is progressively depleted -- there is no
 *   overnight recovery because nighttime temperatures also remain elevated
 *   (urban heat island effect, warm air masses). The plant enters cumulative
 *   stress, requiring significantly more water.
 *
 * THE 85F (29.4C) THRESHOLD:
 *   Agricultural extension research (MSU Extension, NC Climate Office) shows
 *   that most plants exhibit measurable stress responses above 85F. This is
 *   a widely-used benchmark in horticultural guidance.
 *
 * WHY COLD REDUCES NEEDS:
 *   Below ~60F (15.6C), plant metabolic rates drop. Stomata partially
 *   close, reducing transpiration. Root uptake slows. The plant simply uses
 *   less water. Source: Oregon State Extension on environmental factors.
 *
 * MULTIPLIER VALUES:
 *   - 1.5x for heat waves (3+ consecutive hot days): Container and potted
 *     plants may need up to 2x water at >90F. 1.5x is a conservative
 *     general-purpose value. Source: Plantin watering guide.
 *   - 1.2x for a single hot day: Moderate increase, as the soil reservoir
 *     can still buffer some of the extra demand.
 *   - 0.5x for cold: Plant uses roughly half the water when dormancy signals
 *     begin.
 */
export function calculateTemperatureFactor(
  currentWeather: WeatherData,
  recentHistory: ReadonlyArray<WeatherData>,
  isOutdoor: boolean = true
): number {
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
    Option.getOrElse(() => DEFAULT_TEMPERATURE_MEAN_C)
  )

  const outdoorFactor = pipe(
    Match.value({ consecutiveHotDays, currentMean }),
    // 3+ consecutive hot days -> heat wave, 50% more water needed
    Match.when(
      { consecutiveHotDays: (d: number) => d >= HEAT_WAVE_CONSECUTIVE_DAYS },
      () => TEMP_FACTOR_HEAT_WAVE
    ),
    // Single hot day (today) -> moderate increase
    Match.when(
      { currentMean: (t: number) => t > TEMP_HIGH_C },
      () => TEMP_FACTOR_HOT_DAY
    ),
    // Cold day -> reduced needs
    Match.when(
      { currentMean: (t: number) => t < TEMP_LOW_C },
      () => TEMP_FACTOR_COLD_DAY
    ),
    // Normal temperature range
    Match.orElse(() => FACTOR_NEUTRAL)
  )

  // Indoor plants are sheltered -- dampen temperature effects
  if (!isOutdoor) {
    return pipe(
      Match.value(outdoorFactor),
      // Heat wave 1.5 -> 1.15 (indoor still gets some heat stress via ambient temp)
      Match.when(
        (f: number) => f >= TEMP_FACTOR_HEAT_WAVE,
        () => TEMP_FACTOR_INDOOR_HEAT_WAVE
      ),
      // Hot day 1.2 -> 1.1
      Match.when(
        (f: number) => f > FACTOR_NEUTRAL,
        () => TEMP_FACTOR_INDOOR_HOT_DAY
      ),
      // Cold day 0.5 -> 0.85 (indoor stays much warmer)
      Match.when(
        (f: number) => f < FACTOR_NEUTRAL,
        () => TEMP_FACTOR_INDOOR_COLD_DAY
      ),
      // Normal -> 1.0
      Match.orElse(() => FACTOR_NEUTRAL)
    )
  }

  return outdoorFactor
}

// ─── Step 4: Humidity Factor ────────────────────────────────────────────────

/**
 * Calculate the humidity adjustment factor.
 *
 * WHAT IS RELATIVE HUMIDITY?
 *   Relative humidity (RH) is the ratio of the actual amount of water vapor
 *   in the air to the maximum amount the air could hold at that temperature.
 *   Warm air can hold more moisture than cold air, so 50% RH at 30C
 *   contains more water vapor than 50% RH at 10C.
 *
 * HOW IT AFFECTS TRANSPIRATION (Fick's Law of Diffusion):
 *   Water moves from inside the leaf (near 100% RH in the stomatal cavity)
 *   to the surrounding air. The driving force is the vapor pressure gradient
 *   -- the difference between the humidity inside and outside the leaf.
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
export function calculateHumidityFactor(
  currentWeather: WeatherData,
  isOutdoor: boolean = true
): number {
  // Indoor plants live in controlled climate -- humidity has no effect
  if (!isOutdoor) return FACTOR_NEUTRAL

  const humidity = pipe(
    Option.fromNullable(currentWeather.humidity),
    Option.getOrElse(() => DEFAULT_HUMIDITY_PERCENT)
  )

  return pipe(
    Match.value(humidity),
    // High humidity -> 15% less water needed (slower transpiration)
    Match.when(
      (h: number) => h > HUMIDITY_HIGH,
      () => HUMIDITY_FACTOR_HIGH
    ),
    // Low humidity -> 15% more water needed (faster transpiration)
    Match.when(
      (h: number) => h < HUMIDITY_LOW,
      () => HUMIDITY_FACTOR_LOW
    ),
    // Normal humidity range
    Match.orElse(() => FACTOR_NEUTRAL)
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
 * WHY THE EFFECT IS SMALLER THAN TEMPERATURE/HUMIDITY (+/-10% vs +/-15-50%):
 *   For potted and indoor plants (Lily's primary use case), wind exposure is
 *   significantly less than for field crops. Most houseplants are sheltered
 *   by walls, windows, and other structures. The +/-10% adjustment reflects
 *   this reduced impact compared to open-field agriculture.
 *
 * WIND SPEED REFERENCE:
 *   5 m/s = ~11 mph = moderate breeze on the Beaufort scale (category 4)
 *   2 m/s = ~4.5 mph = light breeze (category 2)
 *
 * Source: FAO-56 equation parameterization, wind speed at 2m height
 */
export function calculateWindFactor(
  currentWeather: WeatherData,
  isOutdoor: boolean
): number {
  // Indoor plants are sheltered from wind -- no adjustment needed
  if (!isOutdoor) return FACTOR_NEUTRAL

  const windSpeed = pipe(
    Option.fromNullable(currentWeather.windSpeed),
    Option.getOrElse(() => DEFAULT_WIND_SPEED_MS)
  )

  return pipe(
    Match.value(windSpeed),
    // Strong wind -> 10% more water needed (boundary layer disruption)
    Match.when(
      (w: number) => w > WIND_HIGH,
      () => WIND_FACTOR_HIGH
    ),
    // Light wind -> 10% less water needed (boundary layer intact)
    Match.when(
      (w: number) => w < WIND_LOW,
      () => WIND_FACTOR_LOW
    ),
    // Moderate wind
    Match.orElse(() => FACTOR_NEUTRAL)
  )
}
