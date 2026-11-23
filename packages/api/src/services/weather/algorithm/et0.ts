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

import type { WeatherData } from '@lily/shared'
import {
  HUMIDITY_HIGH,
  HUMIDITY_LOW,
  TEMP_HIGH_C,
  TEMP_LOW_C,
  WIND_HIGH,
  WIND_LOW,
} from '@lily/shared'
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
} from '@lily/shared/indoor-demand'
import { Array, Match, Option, pipe } from 'effect'

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
  const consecutiveHotDays = pipe(
    recentHistory,
    Array.takeWhile(
      (day) => day.temperatureMax !== null && day.temperatureMax > TEMP_HIGH_C
    ),
    Array.length
  )

  const currentMean = pipe(
    Option.fromNullishOr(currentWeather.temperatureMean),
    Option.getOrElse(() => DEFAULT_TEMPERATURE_MEAN_C)
  )

  const outdoorFactor = pipe(
    Match.value({ consecutiveHotDays, currentMean }),
    Match.when(
      { consecutiveHotDays: (d: number) => d >= HEAT_WAVE_CONSECUTIVE_DAYS },
      () => TEMP_FACTOR_HEAT_WAVE
    ),
    Match.when(
      { currentMean: (t: number) => t > TEMP_HIGH_C },
      () => TEMP_FACTOR_HOT_DAY
    ),
    Match.when(
      { currentMean: (t: number) => t < TEMP_LOW_C },
      () => TEMP_FACTOR_COLD_DAY
    ),
    Match.orElse(() => FACTOR_NEUTRAL)
  )

  // Indoor plants are sheltered -- dampen temperature effects
  if (!isOutdoor) {
    return pipe(
      Match.value(outdoorFactor),
      Match.when(
        (f: number) => f >= TEMP_FACTOR_HEAT_WAVE,
        () => TEMP_FACTOR_INDOOR_HEAT_WAVE
      ),
      Match.when(
        (f: number) => f > FACTOR_NEUTRAL,
        () => TEMP_FACTOR_INDOOR_HOT_DAY
      ),
      Match.when(
        (f: number) => f < FACTOR_NEUTRAL,
        () => TEMP_FACTOR_INDOOR_COLD_DAY
      ),
      Match.orElse(() => FACTOR_NEUTRAL)
    )
  }

  return outdoorFactor
}

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
  if (!isOutdoor) return FACTOR_NEUTRAL

  const humidity = pipe(
    Option.fromNullishOr(currentWeather.humidity),
    Option.getOrElse(() => DEFAULT_HUMIDITY_PERCENT)
  )

  return pipe(
    Match.value(humidity),
    Match.when(
      (h: number) => h > HUMIDITY_HIGH,
      () => HUMIDITY_FACTOR_HIGH
    ),
    Match.when(
      (h: number) => h < HUMIDITY_LOW,
      () => HUMIDITY_FACTOR_LOW
    ),
    Match.orElse(() => FACTOR_NEUTRAL)
  )
}

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
  if (!isOutdoor) return FACTOR_NEUTRAL

  const windSpeed = pipe(
    Option.fromNullishOr(currentWeather.windSpeed),
    Option.getOrElse(() => DEFAULT_WIND_SPEED_MS)
  )

  return pipe(
    Match.value(windSpeed),
    Match.when(
      (w: number) => w > WIND_HIGH,
      () => WIND_FACTOR_HIGH
    ),
    Match.when(
      (w: number) => w < WIND_LOW,
      () => WIND_FACTOR_LOW
    ),
    Match.orElse(() => FACTOR_NEUTRAL)
  )
}
