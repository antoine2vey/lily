import {
  adjustedWateringDays,
  calculateIndoorDemandFactor,
  dayOfYearFromIso,
  INDOOR_RH_BASE,
  INDOOR_RH_MAX,
  INDOOR_RH_MIN,
  INDOOR_RH_PIVOT_C,
  INDOOR_RH_SLOPE,
  type IndoorDemandInput,
  indoorVpdFactor,
  LUMINOSITY_LUX_VALUES,
  type LuminosityLevel,
  lightEnergyFactor,
  ORIENTATIONS,
  type Orientation,
  orientationFactor,
  ROOMFIT_DIM_VETO_GAP,
  roomFitFactor,
} from '@lily/shared/indoor-demand'
import { CATALOG, type CatalogEntry } from '@lily/shared/plant-catalog'
import { Array, Option, type Order, pipe, String } from 'effect'
import type { Locale } from '@/i18n'
import { CITIES, type City, type CityId } from './cities'

export { type LuminosityLevel, ORIENTATIONS, type Orientation }

export const LIGHT_LEVELS: ReadonlyArray<LuminosityLevel> = [1, 2, 3, 4, 5]

export const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const
export type Month = (typeof MONTHS)[number]

export const TEMP_MIN_C = -10
export const TEMP_MAX_C = 40

export type PlantId = CatalogEntry['scientificName']

export interface CalculatorInput {
  readonly plantId: PlantId
  readonly light: LuminosityLevel
  readonly orientation: Orientation | null
  readonly cityId: CityId
  readonly month: Month
  readonly outdoorTempC: number
}

export interface CalculatorFactors {
  readonly seasonLight: number
  readonly window: number
  readonly roomFit: number
  readonly dryAir: number
}

export interface CalculatorResult {
  readonly baseDays: number
  readonly days: number
  readonly demand: number
  readonly factors: CalculatorFactors
  readonly dimRoom: boolean
  readonly indoorHumidity: number
}

const DEFAULT_PLANT: CatalogEntry = pipe(
  Array.findFirst(CATALOG, (p) => p.scientificName === 'Monstera deliciosa'),
  Option.orElse(() => Array.head(CATALOG)),
  Option.getOrThrow
)

export const plantById = (id: PlantId): CatalogEntry =>
  pipe(
    Array.findFirst(CATALOG, (p) => p.scientificName === id),
    Option.getOrElse(() => DEFAULT_PLANT)
  )

export type KnownCity = City & { readonly id: CityId }

export const cityById = (id: CityId): KnownCity =>
  pipe(
    Array.findFirst(CITIES, (c) => c.id === id),
    Option.getOrThrow
  )

// Effect's Order module here makes the bundler regroup the chunks, and every page then loads the blog post index.
const byName = <A>(locale: Locale, name: (a: A) => string): Order.Order<A> => {
  const collator = new Intl.Collator(locale)
  return (a, b) => Math.sign(collator.compare(name(a), name(b))) as -1 | 0 | 1
}

export const plantsFor = (locale: Locale): ReadonlyArray<CatalogEntry> =>
  Array.sort(
    CATALOG,
    byName(locale, (p: CatalogEntry) => p.translations[locale].name)
  )

export const citiesFor = (locale: Locale): ReadonlyArray<KnownCity> =>
  Array.sort(
    CITIES,
    byName(locale, (c: KnownCity) => c.names[locale])
  )

// The prerendered page shows this input. A fixed month keeps the HTML the same on every build.
export const defaultInput = (locale: Locale): CalculatorInput => ({
  plantId: DEFAULT_PLANT.scientificName,
  light: 3,
  orientation: null,
  cityId: locale === 'fr' ? 'paris' : 'london',
  month: 1,
  outdoorTempC: 15,
})

// A fixed non-leap year, so the 15th of a month is always the same day of the year.
const dateFor = (month: Month): string =>
  `2025-${pipe(`${month}`, String.padStart(2, '0'))}-15`

export const calculate = (input: CalculatorInput): CalculatorResult => {
  const plant = plantById(input.plantId)
  const { latitude } = cityById(input.cityId)
  const date = dateFor(input.month)
  const roomLuminosity = LUMINOSITY_LUX_VALUES[input.light]
  const demandInput: IndoorDemandInput = {
    latitude,
    day: {
      date,
      temperatureMin: null,
      temperatureMax: null,
      temperatureMean: input.outdoorTempC,
      humidity: null,
      windSpeed: null,
      precipitation: null,
      solarRadiation: null,
      et0: null,
      cloudCover: null,
      soilTemperature: null,
    },
    recentHistory: [],
    category: plant.category,
    roomLuminosity,
    roomOrientation: input.orientation,
    lightingRating: plant.lightingRating,
    humidityRating: plant.humidityRating,
  }
  const demand = calculateIndoorDemandFactor(demandInput)
  const onDay = (f: (dayOfYear: number) => number): number =>
    pipe(dayOfYearFromIso(date), Option.match({ onNone: () => 1, onSome: f }))
  const room = roomFitFactor(
    roomLuminosity,
    plant.lightingRating,
    plant.category
  )
  return {
    baseDays: plant.wateringFrequencyDays,
    days: adjustedWateringDays(plant.wateringFrequencyDays, demand),
    demand,
    factors: {
      seasonLight: onDay((d) => lightEnergyFactor(latitude, d, plant.category)),
      window: onDay((d) => orientationFactor(latitude, d, input.orientation)),
      roomFit: room.factor,
      dryAir: indoorVpdFactor(input.outdoorTempC, plant.humidityRating),
    },
    dimRoom: room.gap <= ROOMFIT_DIM_VETO_GAP,
    indoorHumidity: Math.min(
      INDOOR_RH_MAX,
      Math.max(
        INDOOR_RH_MIN,
        INDOOR_RH_BASE +
          INDOOR_RH_SLOPE * (input.outdoorTempC - INDOOR_RH_PIVOT_C)
      )
    ),
  }
}
