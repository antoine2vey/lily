import type { SqlError } from '@effect/sql/SqlError'
import type { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import { CareScheduleRepository } from '@lily/api/repositories/care-schedule.repository'
import type { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
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
import { type CareType, roundCoord, startOfDay } from '@lily/shared'
import { FutureDateNotAllowedError } from '@lily/shared/errors/plant'
import type { EventBus } from '@lily/shared/server'
import { DateTime, Duration, Effect, Match, Option, pipe } from 'effect'

export type { CareType } from '@lily/shared'

export interface ExecutePlantCareParams {
  readonly plantId: string
  readonly careType: CareType
  readonly notes?: string | undefined
  readonly date?: Date | undefined
}

// Apply weather adjustment to the next care date if user has weather enabled
const applyWeatherAdjustment = (
  user: {
    weatherEnabled: boolean | null
    latitude: number | null
    longitude: number | null
  },
  timezone: string,
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
  WeatherProvider | WeatherCache | WeatherRepository
> =>
  Effect.gen(function* () {
    if (!nextCareAt) return nextCareAt
    if (!user.weatherEnabled || !user.latitude || !user.longitude) {
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
    // Truncate to the user's local midnight, not UTC — otherwise daily schedules
    // can land back inside the same local day when the user acts between local
    // and UTC midnight, producing a task they can re-validate immediately.
    const nowDayStart = startOfDay(nowDt, timezone)
    return pipe(
      Match.value(careType),
      Match.when('watering', () =>
        DateTime.toDateUtc(
          DateTime.addDuration(
            nowDayStart,
            Duration.days(adjustment.adjustedWateringDays)
          )
        )
      ),
      Match.when('fertilization', () => nextCareAt),
      Match.when('misting', () => nextCareAt),
      Match.when('repotting', () => nextCareAt),
      Match.exhaustive
    )
  })

export const executePlantCare = (
  plant: PlantWithRoom,
  params: ExecutePlantCareParams
): Effect.Effect<
  PlantWithRoom,
  SqlError | FutureDateNotAllowedError,
  | PlantRepository
  | CareLogRepository
  | CareScheduleRepository
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
    const scheduleRepo = yield* CareScheduleRepository
    const notificationRepo = yield* NotificationRepository
    const userRepo = yield* UserRepository

    // Load user once — both timezone (for day-boundary math) and weather flags
    // (consumed inside applyWeatherAdjustment) come from the same row.
    const user = yield* userRepo.findById(plant.userId)
    const timezone = pipe(
      Option.fromNullable(user),
      Option.flatMap((u) => Option.fromNullable(u.timezone)),
      Option.getOrElse(() => 'UTC')
    )

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
      return yield* new FutureDateNotAllowedError()
    }

    const careDate = DateTime.toDateUtc(careDt)
    const isPastCare = Option.isSome(Option.fromNullable(params.date))

    // Create care log + publish events (CareLogCreated, AttentionResponded, ReminderResponded)
    // Called before plant update so createCareLog sees the original health state
    yield* createCareLog(params.plantId, {
      type: params.careType,
      notes: params.notes,
      date: careDate,
    })

    // Get frequency from schedule table
    const schedule = yield* scheduleRepo.findByPlantAndType(
      params.plantId,
      params.careType
    )
    const frequency = pipe(
      Option.fromNullable(schedule),
      Option.map((s) => s.frequencyDays),
      Option.getOrNull
    )

    // Normalize to start-of-day in the user's local timezone so that the next
    // care date lands at *their* midnight + N days. Truncating in UTC would let
    // the next date fall back inside the same local day when validating between
    // local and UTC midnight, making the task re-appear after one tap.
    const careDayStart = startOfDay(careDt, timezone)

    // Calculate next care date from the care date (if frequency exists)
    const nextCareAt = pipe(
      Option.fromNullable(frequency),
      Option.map((days) =>
        DateTime.toDateUtc(
          DateTime.addDuration(careDayStart, Duration.days(days))
        )
      ),
      Option.getOrUndefined
    )

    // Skip weather adjustment for past dates (no historical weather data available)
    const adjustedNextCareAt = isPastCare
      ? Effect.succeed(nextCareAt)
      : applyWeatherAdjustment(
          user ?? { weatherEnabled: false, latitude: null, longitude: null },
          timezone,
          {
            id: plant.id,
            category: plant.category,
            wateringFrequencyDays: pipe(
              Option.fromNullable(schedule),
              Option.map((s) => s.frequencyDays),
              Option.getOrElse(() => 7)
            ),
            wateringRating: plant.wateringRating,
            isOutdoor: pipe(
              Option.fromNullable(plant.room),
              Option.map((r) => r.isOutdoor),
              Option.getOrElse(() => false)
            ),
          },
          params.careType,
          nextCareAt,
          nowDt
        )

    const finalNextCareAt = yield* adjustedNextCareAt

    // Update schedule table
    if (schedule) {
      yield* scheduleRepo.updateByPlantAndType(
        params.plantId,
        params.careType,
        {
          lastCareAt: careDate,
          ...(finalNextCareAt ? { nextCareAt: finalNextCareAt } : {}),
        }
      )
    }

    // Re-fetch to include room data
    const refetched = yield* repo.findById(params.plantId)
    const updatedPlant = pipe(
      Option.fromNullable(refetched),
      Option.getOrElse(() => plant)
    )

    // Schedule next reminder if we have a next care date
    if (finalNextCareAt) {
      yield* scheduleCareReminder({
        plantId: params.plantId,
        userId: plant.userId,
        type: `${params.careType}_reminder` as const,
        scheduledDate: finalNextCareAt,
        remindersEnabled: plant.remindersEnabled,
      })
    }

    // Clear any pending overdue reminders — the user just performed care
    yield* notificationRepo.deletePendingByPlantAndType(
      params.plantId,
      'overdue_reminder'
    )

    return updatedPlant
  })
