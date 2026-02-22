import type { SqlError } from '@effect/sql/SqlError'
import type { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import type { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import type { NotificationRepository } from '@lily/api/repositories/notification.repository'
import {
  PlantRepository,
  type PlantWithRoom,
} from '@lily/api/repositories/plant.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import type { WeatherRepository } from '@lily/api/repositories/weather.repository'
import type { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { createCareLog } from '@lily/api/services/care-logs/endpoints/create-care-log'
import { scheduleCareReminder } from '@lily/api/services/plants/helpers/schedule-care-reminder'
import { calculatePlantAdjustment } from '@lily/api/services/weather/algorithm'
import type { WeatherCache } from '@lily/api/services/weather/cache'
import { getWeatherContext } from '@lily/api/services/weather/helpers/get-weather-context'
import type { WeatherProvider } from '@lily/api/services/weather/provider'
import { roundCoord } from '@lily/shared'
import {
  FutureDateNotAllowedError,
  PlantNotFoundError,
} from '@lily/shared/errors/plant'
import type { EventBus } from '@lily/shared/server'
import { DateTime, Duration, Effect, Match, Option, pipe } from 'effect'

export type CareType = 'watering' | 'fertilization'

export interface ExecutePlantCareParams {
  readonly plantId: string
  readonly careType: CareType
  readonly notes?: string | undefined
  readonly date?: Date | undefined
}

// Configuration for each care type
interface CareTypeConfig {
  readonly frequencyField:
    | 'wateringFrequencyDays'
    | 'fertilizationFrequencyDays'
  readonly lastCareField: 'lastWateredAt' | 'lastFertilizedAt'
  readonly nextCareField: 'nextWateringAt' | 'nextFertilizationAt'
  readonly reminderType: 'watering_reminder' | 'fertilization_reminder'
  readonly careLogType: 'watering' | 'fertilization'
}

const getCareTypeConfig = (careType: CareType): CareTypeConfig =>
  pipe(
    Match.value(careType),
    Match.when('watering', () => ({
      frequencyField: 'wateringFrequencyDays' as const,
      lastCareField: 'lastWateredAt' as const,
      nextCareField: 'nextWateringAt' as const,
      reminderType: 'watering_reminder' as const,
      careLogType: 'watering' as const,
    })),
    Match.when('fertilization', () => ({
      frequencyField: 'fertilizationFrequencyDays' as const,
      lastCareField: 'lastFertilizedAt' as const,
      nextCareField: 'nextFertilizationAt' as const,
      reminderType: 'fertilization_reminder' as const,
      careLogType: 'fertilization' as const,
    })),
    Match.exhaustive
  )

// Apply weather adjustment to the next care date if user has weather enabled
const applyWeatherAdjustment = (
  userId: string,
  plant: {
    id: string
    category: string | null
    wateringFrequencyDays: number
    wateringRating: number
    isOutdoor: boolean
  },
  careType: CareType,
  nextCareAt: Date | undefined,
  nowDt: DateTime.Utc
): Effect.Effect<
  Date | undefined,
  never,
  UserRepository | WeatherProvider | WeatherCache | WeatherRepository
> =>
  Effect.gen(function* () {
    if (!nextCareAt) return nextCareAt

    const userRepo = yield* UserRepository
    const user = yield* userRepo.findById(userId)

    if (!user || !user.weatherEnabled || !user.latitude || !user.longitude) {
      return nextCareAt
    }

    const rlat = roundCoord(user.latitude)
    const rlng = roundCoord(user.longitude)

    // Attempt to get weather context — if it fails, silently return original date
    const weatherResult = yield* getWeatherContext(rlat, rlng).pipe(
      Effect.option
    )

    if (Option.isNone(weatherResult)) {
      return nextCareAt
    }

    const { currentWeather, recentHistory, forecast } = weatherResult.value

    const adjustment = calculatePlantAdjustment(
      plant,
      currentWeather,
      recentHistory,
      forecast
    )

    // For manual care, skip flags don't apply — the user just performed the action,
    // so we always use adjustedWateringDays to schedule the next one.
    return pipe(
      Match.value(careType),
      Match.when('watering', () =>
        DateTime.toDateUtc(
          DateTime.addDuration(
            nowDt,
            Duration.days(adjustment.adjustedWateringDays)
          )
        )
      ),
      Match.when('fertilization', () => nextCareAt),
      Match.exhaustive
    )
  }).pipe(
    // If anything fails in weather adjustment, silently return original date
    Effect.catchAll(() => Effect.succeed(nextCareAt))
  )

export const executePlantCare = (
  params: ExecutePlantCareParams
): Effect.Effect<
  PlantWithRoom,
  SqlError | PlantNotFoundError | FutureDateNotAllowedError,
  | PlantRepository
  | CareLogRepository
  | NotificationRepository
  | UserRepository
  | WeatherProvider
  | WeatherCache
  | WeatherRepository
  | DelegationRepository
  | EventBus
  | CurrentUser
> =>
  Effect.gen(function* () {
    const repo = yield* PlantRepository
    const config = getCareTypeConfig(params.careType)

    // Fetch the plant
    const plant = yield* repo.findById(params.plantId)

    if (!plant) {
      return yield* Effect.fail(new PlantNotFoundError())
    }

    const nowDt = DateTime.unsafeNow()

    // Use provided date (past care) or current time
    const careDt = pipe(
      Option.fromNullable(params.date),
      Option.map((d) => DateTime.unsafeMake(d)),
      Option.getOrElse(() => nowDt)
    )

    // Validate that the provided date is not in the future (1-minute tolerance for clock skew)
    if (
      DateTime.greaterThan(
        careDt,
        DateTime.addDuration(nowDt, Duration.minutes(1))
      )
    ) {
      return yield* Effect.fail(new FutureDateNotAllowedError())
    }

    const careDate = DateTime.toDateUtc(careDt)
    const isPastCare = Option.isSome(Option.fromNullable(params.date))

    // Create care log + publish events (CareLogCreated, AttentionResponded, ReminderResponded)
    // Called before plant update so createCareLog sees the original health state
    yield* createCareLog(params.plantId, {
      type: config.careLogType,
      notes: params.notes,
      date: careDate,
    })

    // Get frequency - watering always has frequency, fertilization is optional
    const frequency = plant[config.frequencyField]

    // Calculate next care date from the care date (if frequency exists)
    const nextCareAt = pipe(
      Option.fromNullable(frequency),
      Option.map((days) =>
        DateTime.toDateUtc(DateTime.addDuration(careDt, Duration.days(days)))
      ),
      Option.getOrUndefined
    )

    // Skip weather adjustment for past dates (no historical weather data available)
    const adjustedNextCareAt = isPastCare
      ? Effect.succeed(nextCareAt)
      : applyWeatherAdjustment(
          plant.userId,
          {
            id: plant.id,
            category: plant.category,
            wateringFrequencyDays: plant.wateringFrequencyDays,
            wateringRating: plant.wateringRating,
            isOutdoor: plant.room?.isOutdoor ?? false,
          },
          params.careType,
          nextCareAt,
          nowDt
        )

    const finalNextCareAt = yield* adjustedNextCareAt

    const updatePayload = {
      [config.lastCareField]: careDate,
      ...(finalNextCareAt && {
        [config.nextCareField]: finalNextCareAt,
      }),
    }

    // Update the plant
    yield* repo.update(params.plantId, updatePayload)

    // Re-fetch to include room data
    const updatedPlant = yield* repo.findById(params.plantId)

    if (!updatedPlant) {
      return yield* Effect.fail(new PlantNotFoundError())
    }

    // Schedule next reminder if we have a next care date
    if (finalNextCareAt) {
      yield* scheduleCareReminder({
        plantId: params.plantId,
        plantName: plant.name,
        userId: plant.userId,
        type: config.reminderType,
        scheduledDate: finalNextCareAt,
        remindersEnabled: plant.remindersEnabled,
      })
    }

    return updatedPlant
  })
