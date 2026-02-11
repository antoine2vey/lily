import type { SqlError } from '@effect/sql/SqlError'
import { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import type { NotificationRepository } from '@lily/api/repositories/notification.repository'
import {
  PlantRepository,
  type PlantWithRoom,
} from '@lily/api/repositories/plant.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import type { WeatherRepository } from '@lily/api/repositories/weather.repository'
import { scheduleCareReminder } from '@lily/api/services/plants/helpers/schedule-care-reminder'
import { calculatePlantAdjustment } from '@lily/api/services/weather/algorithm'
import type { WeatherCache } from '@lily/api/services/weather/cache'
import { getWeatherContext } from '@lily/api/services/weather/helpers/get-weather-context'
import type { WeatherProvider } from '@lily/api/services/weather/provider'
import { roundCoord } from '@lily/shared'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import { DateTime, Duration, Effect, Match, Option, pipe } from 'effect'

export type CareType = 'watering' | 'fertilization'

export interface ExecutePlantCareParams {
  readonly plantId: string
  readonly careType: CareType
  readonly notes?: string | undefined
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
  SqlError | PlantNotFoundError,
  | PlantRepository
  | CareLogRepository
  | NotificationRepository
  | UserRepository
  | WeatherProvider
  | WeatherCache
  | WeatherRepository
> =>
  Effect.gen(function* () {
    const repo = yield* PlantRepository
    const careLogRepo = yield* CareLogRepository
    const config = getCareTypeConfig(params.careType)

    // Fetch the plant
    const plant = yield* repo.findById(params.plantId)

    if (!plant) {
      return yield* Effect.fail(new PlantNotFoundError())
    }

    const nowDt = DateTime.unsafeNow()
    const now = DateTime.toDateUtc(nowDt)

    // Get frequency - watering always has frequency, fertilization is optional
    const frequency = plant[config.frequencyField]

    // Calculate next care date (if frequency exists)
    const nextCareAt = pipe(
      Option.fromNullable(frequency),
      Option.map((days) =>
        DateTime.toDateUtc(DateTime.addDuration(nowDt, Duration.days(days)))
      ),
      Option.getOrUndefined
    )

    // Apply weather-based adjustment to next care date
    const adjustedNextCareAt = yield* applyWeatherAdjustment(
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

    // Build update payload dynamically
    // Reset health to HEALTHY if plant was NEEDS_ATTENTION
    const healthUpdate =
      plant.health === 'NEEDS_ATTENTION' ? { health: 'HEALTHY' as const } : {}

    const updatePayload = {
      [config.lastCareField]: now,
      ...(adjustedNextCareAt && {
        [config.nextCareField]: adjustedNextCareAt,
      }),
      ...healthUpdate,
    }

    // Update the plant
    yield* repo.update(params.plantId, updatePayload)

    // Re-fetch to include room data
    const updatedPlant = yield* repo.findById(params.plantId)

    if (!updatedPlant) {
      return yield* Effect.fail(new PlantNotFoundError())
    }

    // Create care log record
    yield* careLogRepo.create({
      type: config.careLogType,
      plantId: params.plantId,
      notes: params.notes,
      date: now,
    })

    // Schedule next reminder if we have a next care date
    if (adjustedNextCareAt) {
      yield* scheduleCareReminder({
        plantId: params.plantId,
        plantName: plant.name,
        userId: plant.userId,
        type: config.reminderType,
        scheduledDate: adjustedNextCareAt,
        remindersEnabled: plant.remindersEnabled,
      })
    }

    return updatedPlant
  })
