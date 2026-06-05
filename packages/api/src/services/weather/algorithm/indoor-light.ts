/**
 * Indoor light / growth watering-demand model.
 *
 * Outdoor watering demand is driven by ET0 (full Penman-Monteith) and the
 * temperature/humidity/wind factors in `et0.ts`. Indoors, that outdoor weather
 * is a poor proxy — a houseplant lives in a climate-controlled room. This
 * module computes a meaningful indoor DEMAND factor from signals that actually
 * describe the plant's real environment:
 *
 *   - PHOTOPERIOD × SOLAR INTENSITY: day length and noon sun angle from the
 *     user's latitude + the date. Pure astronomy, hemisphere-aware, NOT a
 *     weather proxy — it is the physiological trigger for seasonal dormancy.
 *   - WINDOW ORIENTATION: how the room's aspect redistributes seasonal light
 *     (engages once `rooms.orientation` is populated; null => neutral).
 *   - ROOM LIGHT FIT: measured room luminosity vs the plant's lighting need.
 *   - OBSERVED SKY: recent cloud cover / solar radiation (a gloomy week truly
 *     dims a windowsill).
 *   - INDOOR DRYNESS (VPD): cold outside => heating on => dry air => more water.
 *
 * Every factor is centered at 1.0 (neutral) and collapses to 1.0 when its
 * data is missing, so the floor of the model is "no change". Higher demand =>
 * fewer days between waterings => water sooner (the existing contract).
 *
 * SAFETY: a light-starved / dormant plant is never told to water SOONER, even
 * in dry heated air — that is the leading cause of houseplant root rot. See the
 * dim-room veto and dormancy gate in `calculateIndoorDemandFactor`.
 *
 * Primary references: FAO-56 (declination/day-length, eq. 24-25; VPD, ch. 3),
 * Oregon State Extension (photoperiodism & dormancy).
 */

import {
  DEFAULT_TEMPERATURE_MEAN_C,
  FACTOR_NEUTRAL,
  HUM_RATING_STEP,
  INDOOR_DEMAND_MAX,
  INDOOR_DEMAND_MIN,
  INDOOR_RH_BASE,
  INDOOR_RH_MAX,
  INDOOR_RH_MIN,
  INDOOR_RH_PIVOT_C,
  INDOOR_RH_SLOPE,
  INDOOR_TEMP_C,
  INDOOR_VPD_AMP,
  INDOOR_VPD_FACTOR_MAX,
  INDOOR_VPD_FACTOR_MIN,
  LIGHT_DORMANT_THRESHOLD,
  LIGHT_ENERGY_FACTOR_MAX,
  LIGHT_ENERGY_FACTOR_MIN,
  LIGHT_GROWTH_FACTOR_MAX,
  LIGHT_GROWTH_FACTOR_MIN,
  MS_PER_DAY,
  ORIENT_AMP,
  ORIENT_FACTOR_MAX,
  ORIENT_FACTOR_MIN,
  PHOTO_AMP,
  PHOTO_CATEGORY_SENSITIVITY,
  PHOTO_DAYNORM_MAX,
  PHOTO_DAYNORM_MIN,
  PHOTO_DEFAULT_SENSITIVITY,
  PHOTO_EQUINOX_DAY_HOURS,
  PHOTO_INTENSITY_MAX,
  PHOTO_INTENSITY_MIN,
  PHOTO_REF_SOLAR_ELEVATION_DEG,
  ROOMFIT_CAM_CAP,
  ROOMFIT_DIM_VETO_GAP,
  ROOMFIT_FACTOR_MAX,
  ROOMFIT_FACTOR_MIN,
  ROOMFIT_STEP,
  SKY_AMP,
  SKY_CLOUD_PIVOT,
  SKY_CLOUD_SPAN,
  SKY_FACTOR_MAX,
  SKY_FACTOR_MIN,
  SKY_RECENT_DAYS,
  SKY_SOLAR_REF,
  SKY_SOLAR_SPAN,
  VPD_REFERENCE_KPA,
} from '@lily/api/services/weather/algorithm/coefficients'
import type { WeatherData } from '@lily/shared'
import {
  LUMINOSITY_LUX_VALUES,
  luxToLuminosityLevel,
  parseApiDate,
} from '@lily/shared'
import { Array, DateTime, Option, pipe, String } from 'effect'

const DEG_TO_RAD = Math.PI / 180
const RAD_TO_DEG = 180 / Math.PI

/** Drought-adapted categories whose watering may never be accelerated by light. */
const CAM_CATEGORIES = new Set(['Succulent', 'Cactus'])

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(value, max))

const sum = (values: ReadonlyArray<number>): number =>
  Array.reduce(values, 0, (acc, v) => acc + v)

const meanOfNonNull = (
  values: ReadonlyArray<number | null>
): Option.Option<number> =>
  pipe(Array.filterMap(values, Option.fromNullable), (present) =>
    Array.isNonEmptyReadonlyArray(present)
      ? Option.some(sum(present) / present.length)
      : Option.none()
  )

export interface IndoorDemandInput {
  /** User latitude in degrees; the caller guarantees a finite value. */
  readonly latitude: number
  /** The weather day this demand is for (supplies date for photoperiod, temp for VPD). */
  readonly day: WeatherData
  /** Recent history (most recent first) used to smooth the sky/cloud signal. */
  readonly recentHistory: ReadonlyArray<WeatherData>
  readonly category: string | null
  readonly roomLuminosity: number | null
  readonly roomOrientation: string | null
  readonly lightingRating: number
  readonly humidityRating: number
}

// ─── Astronomy: declination, day length, noon elevation ─────────────────────

/** Solar declination (radians) from day-of-year. FAO-56 eq. 24. */
const solarDeclinationRad = (dayOfYear: number): number =>
  0.409 * Math.sin((2 * Math.PI * dayOfYear) / 365 - 1.39)

/**
 * Hours of daylight from latitude + day-of-year. FAO-56 eq. 25.
 *
 * The `clamp(..., -1, 1)` on the acos argument is LOAD-BEARING: at polar
 * latitudes during midnight sun / polar night, `-tan(lat)·tan(decl)` exceeds
 * ±1 and would otherwise produce NaN. Clamping saturates day length to 0h/24h.
 */
export const dayLengthHours = (latitude: number, dayOfYear: number): number => {
  const latRad = latitude * DEG_TO_RAD
  const declRad = solarDeclinationRad(dayOfYear)
  const hourAngle = Math.acos(
    clamp(-Math.tan(latRad) * Math.tan(declRad), -1, 1)
  )
  return (24 * hourAngle) / Math.PI
}

/** Noon sun elevation angle (degrees), floored at 0 (sun below horizon). */
export const solarNoonElevationDeg = (
  latitude: number,
  dayOfYear: number
): number => {
  const declDeg = solarDeclinationRad(dayOfYear) * RAD_TO_DEG
  return Math.max(0, 90 - Math.abs(latitude - declDeg))
}

/** Parse a WeatherData `date` ("YYYY-MM-DD") to day-of-year (1-366). */
export const dayOfYearFromIso = (date: string): Option.Option<number> =>
  pipe(
    parseApiDate(date),
    Option.map((dt) => {
      const parts = DateTime.toParts(dt)
      const startOfYear = DateTime.unsafeMake({
        year: parts.year,
        month: 1,
        day: 1,
      })
      const dayStart = DateTime.unsafeMake({
        year: parts.year,
        month: parts.month,
        day: parts.day,
      })
      return (
        Math.floor(DateTime.distance(startOfYear, dayStart) / MS_PER_DAY) + 1
      )
    })
  )

// ─── Term 1: Light energy (photoperiod × intensity, season applied once) ─────

const categorySensitivity = (category: string | null): number =>
  pipe(
    Option.fromNullable(category),
    Option.flatMap((cat) =>
      Option.fromNullable(PHOTO_CATEGORY_SENSITIVITY[cat])
    ),
    Option.getOrElse(() => PHOTO_DEFAULT_SENSITIVITY)
  )

/**
 * Fuse day-length and noon-intensity into a single growth term. The geometric
 * mean ensures the annual cycle is applied ONCE (not squared) — duration and
 * intensity both rise/fall with the season, so multiplying them then taking the
 * root keeps the swing physical rather than compounding it.
 */
export const lightEnergyFactor = (
  latitude: number,
  dayOfYear: number,
  category: string | null
): number => {
  const dayNorm = clamp(
    dayLengthHours(latitude, dayOfYear) / PHOTO_EQUINOX_DAY_HOURS,
    PHOTO_DAYNORM_MIN,
    PHOTO_DAYNORM_MAX
  )
  const intensityNorm = clamp(
    Math.sin(solarNoonElevationDeg(latitude, dayOfYear) * DEG_TO_RAD) /
      Math.sin(PHOTO_REF_SOLAR_ELEVATION_DEG * DEG_TO_RAD),
    PHOTO_INTENSITY_MIN,
    PHOTO_INTENSITY_MAX
  )
  const lightEnergyRaw = Math.sqrt(dayNorm * intensityNorm)
  const amp = PHOTO_AMP * categorySensitivity(category)
  return clamp(
    1 + amp * (lightEnergyRaw - 1),
    LIGHT_ENERGY_FACTOR_MIN,
    LIGHT_ENERGY_FACTOR_MAX
  )
}

// ─── Term 2: Window orientation (seasonal light redistribution) ─────────────

// Aspect score for the northern hemisphere (equator-facing = South = +1).
// Flipped automatically for southern latitudes.
const ORIENTATION_ASPECT: Record<string, number> = {
  N: -1,
  S: 1,
  E: 0,
  W: 0,
  NE: -0.5,
  NW: -0.5,
  SE: 0.5,
  SW: 0.5,
}

/**
 * Orientation modulates how much seasonal sun reaches the window. The effect is
 * strongest when the sun is low (winter): an equator-facing window catches the
 * low winter sun, a pole-facing one stays in shade. Reuses the noon elevation
 * so it never re-applies the seasonal cycle. Null/unknown orientation => 1.0.
 */
export const orientationFactor = (
  latitude: number,
  dayOfYear: number,
  orientation: string | null
): number => {
  const aspect = pipe(
    Option.fromNullable(orientation),
    Option.map((o) => pipe(o, String.trim, String.toUpperCase)),
    Option.flatMap((o) => Option.fromNullable(ORIENTATION_ASPECT[o])),
    Option.getOrElse(() => 0)
  )
  if (aspect === 0) return FACTOR_NEUTRAL

  const hemisphereSign = latitude < 0 ? -1 : 1
  const elevation = solarNoonElevationDeg(latitude, dayOfYear)
  const seasonLow = clamp(
    (PHOTO_REF_SOLAR_ELEVATION_DEG - elevation) / PHOTO_REF_SOLAR_ELEVATION_DEG,
    0,
    1
  )
  return clamp(
    1 + ORIENT_AMP * aspect * hemisphereSign * (0.5 + 0.5 * seasonLow),
    ORIENT_FACTOR_MIN,
    ORIENT_FACTOR_MAX
  )
}

// ─── Term 3: Room light fit (room luminosity vs plant lighting need) ─────────

export interface RoomFitResult {
  readonly factor: number
  /** roomLevel - plantLevel (1-5 scale). <= ROOMFIT_DIM_VETO_GAP => dormant. */
  readonly gap: number
}

export const roomFitFactor = (
  roomLuminosity: number | null,
  lightingRating: number,
  category: string | null
): RoomFitResult =>
  pipe(
    Option.fromNullable(roomLuminosity),
    Option.match({
      onNone: () => ({ factor: FACTOR_NEUTRAL, gap: 0 }),
      onSome: (lux) => {
        const roomLevel = luxToLuminosityLevel(lux)
        const plantLevel = luxToLuminosityLevel(
          LUMINOSITY_LUX_VALUES[
            clamp(lightingRating, 1, 5) as 1 | 2 | 3 | 4 | 5
          ]
        )
        const gap = roomLevel - plantLevel
        const raw = clamp(
          1 + ROOMFIT_STEP * gap,
          ROOMFIT_FACTOR_MIN,
          ROOMFIT_FACTOR_MAX
        )
        // CAM/drought plants: a bright room may never ACCELERATE watering.
        const factor = pipe(
          Option.fromNullable(category),
          Option.filter((cat) => CAM_CATEGORIES.has(cat)),
          Option.match({
            onNone: () => raw,
            onSome: () => Math.min(raw, ROOMFIT_CAM_CAP),
          })
        )
        return { factor, gap }
      },
    })
  )

// ─── Term 4: Observed sky (cloud cover primary, solar radiation fallback) ────

export const skyFactor = (
  today: WeatherData,
  recentHistory: ReadonlyArray<WeatherData>
): number => {
  const days = Array.prepend(Array.take(recentHistory, SKY_RECENT_DAYS), today)
  return pipe(
    meanOfNonNull(Array.map(days, (d) => d.cloudCover)),
    Option.map((avgCloud) =>
      clamp(
        1 - SKY_AMP * ((avgCloud - SKY_CLOUD_PIVOT) / SKY_CLOUD_SPAN),
        SKY_FACTOR_MIN,
        SKY_FACTOR_MAX
      )
    ),
    Option.orElse(() =>
      pipe(
        meanOfNonNull(Array.map(days, (d) => d.solarRadiation)),
        Option.map((avgRad) =>
          clamp(
            1 + (avgRad - SKY_SOLAR_REF) / SKY_SOLAR_SPAN,
            SKY_FACTOR_MIN,
            SKY_FACTOR_MAX
          )
        )
      )
    ),
    Option.getOrElse(() => FACTOR_NEUTRAL)
  )
}

// ─── Term 5: Indoor heating-season dryness (VPD) ─────────────────────────────

/**
 * Saturation vapor pressure (kPa) at a temperature (°C). FAO-56 eq. 11.
 */
const saturationVaporPressureKpa = (tempC: number): number =>
  0.6108 * Math.exp((17.27 * tempC) / (tempC + 237.3))

/**
 * Estimate indoor VPD demand. Indoor RH is modeled to fall as the OUTDOOR air
 * gets colder (heating dries the air); indoor air temperature is assumed
 * constant. A high `humidityRating` plant (e.g. a fern) is penalized more by
 * dry air. Result centered at 1.0 against a reference VPD.
 */
export const indoorVpdFactor = (
  temperatureMean: number | null,
  humidityRating: number
): number => {
  const tOut = pipe(
    Option.fromNullable(temperatureMean),
    Option.getOrElse(() => DEFAULT_TEMPERATURE_MEAN_C)
  )
  const rhIndoor = clamp(
    INDOOR_RH_BASE + INDOOR_RH_SLOPE * (tOut - INDOOR_RH_PIVOT_C),
    INDOOR_RH_MIN,
    INDOOR_RH_MAX
  )
  const vpd = saturationVaporPressureKpa(INDOOR_TEMP_C) * (1 - rhIndoor / 100)
  const rawFactor = vpd / VPD_REFERENCE_KPA
  const humSens = 1 + HUM_RATING_STEP * (humidityRating - 3)
  return clamp(
    1 + INDOOR_VPD_AMP * humSens * (rawFactor - 1),
    INDOOR_VPD_FACTOR_MIN,
    INDOOR_VPD_FACTOR_MAX
  )
}

// ─── Composition: the indoor demand factor ──────────────────────────────────

/**
 * Compose the indoor watering DEMAND factor (centered at 1.0; >1 => water
 * sooner). Only called when the user's latitude is known.
 *
 *   lightGrowth = clamp(lightEnergy × orientation × roomFit × sky)
 *   demand      = clamp(indoorVpd × lightGrowth)
 *
 * Two safety vetoes protect a non-photosynthesizing plant from overwatering:
 *   - DIM-ROOM VETO: room >= 2 levels too dim (gap <= -2) caps the light term
 *     at 1.0 and forces the whole demand <= 1.0.
 *   - DORMANCY GATE: if growth is at/below the dormant threshold, dry heated
 *     air (high VPD) may LENGTHEN but never SHORTEN the interval.
 */
export const calculateIndoorDemandFactor = (
  input: IndoorDemandInput
): number => {
  const doy = dayOfYearFromIso(input.day.date)

  const lightEnergy = pipe(
    doy,
    Option.match({
      onNone: () => FACTOR_NEUTRAL,
      onSome: (d) => lightEnergyFactor(input.latitude, d, input.category),
    })
  )
  const orientation = pipe(
    doy,
    Option.match({
      onNone: () => FACTOR_NEUTRAL,
      onSome: (d) =>
        orientationFactor(input.latitude, d, input.roomOrientation),
    })
  )
  const room = roomFitFactor(
    input.roomLuminosity,
    input.lightingRating,
    input.category
  )
  const sky = skyFactor(input.day, input.recentHistory)

  const rawLight = lightEnergy * orientation * room.factor * sky
  const dimVeto = room.gap <= ROOMFIT_DIM_VETO_GAP
  const lightGrowth = clamp(
    dimVeto ? Math.min(rawLight, FACTOR_NEUTRAL) : rawLight,
    LIGHT_GROWTH_FACTOR_MIN,
    LIGHT_GROWTH_FACTOR_MAX
  )

  const vpd = indoorVpdFactor(input.day.temperatureMean, input.humidityRating)
  const demandRaw = vpd * lightGrowth

  const dormant = dimVeto || lightGrowth <= LIGHT_DORMANT_THRESHOLD
  const demand = dormant ? Math.min(demandRaw, FACTOR_NEUTRAL) : demandRaw

  return clamp(demand, INDOOR_DEMAND_MIN, INDOOR_DEMAND_MAX)
}
