import { publishWithRetry } from '@lily/api/events'
import type { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import { CarePlanRepository } from '@lily/api/repositories/care-plan.repository'
import { CareScheduleRepository } from '@lily/api/repositories/care-schedule.repository'
import type { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import {
  PlantRepository,
  type PlantWithRoom,
} from '@lily/api/repositories/plant.repository'
import type { UserRepository } from '@lily/api/repositories/user.repository'
import type { WeatherRepository } from '@lily/api/repositories/weather.repository'
import type { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { createCareLog } from '@lily/api/services/care-logs/endpoints/create-care-log'
import {
  type CareContext,
  careContext,
} from '@lily/api/services/plants/helpers/care-context'
import { reconcileCareReminder } from '@lily/api/services/plants/helpers/reconcile-reminders'
import {
  reminderKeysFor,
  withReminderKeys,
} from '@lily/api/services/plants/helpers/reminder-keys'
import {
  calculatePlantAdjustment,
  type PlantForAdjustment,
  toIndoorPlantContext,
} from '@lily/api/services/weather/algorithm'
import type { WeatherCache } from '@lily/api/services/weather/cache'
import {
  getWeatherContext,
  type WeatherContext,
} from '@lily/api/services/weather/helpers/get-weather-context'
import type { WeatherProvider } from '@lily/api/services/weather/provider'
import { type CareType, roundCoord, startOfDay } from '@lily/shared'
import {
  AlreadyCaredTodayError,
  FutureDateNotAllowedError,
} from '@lily/shared/errors/plant'
import { type AppEvent, EventBus, type IEventBus } from '@lily/shared/server'
import {
  Array,
  DateTime,
  Duration,
  Effect,
  Match,
  Option,
  pipe,
  Ref,
} from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

export type { CareType } from '@lily/shared'

export interface ExecutePlantCareParams {
  readonly plantId: string
  readonly careType: CareType
  readonly notes?: string | undefined
  readonly date?: Date | undefined
  // When the care action was initiated from a care-plan step, that exact step
  // is marked done. Otherwise the earliest open step of the same care type on
  // an accepted plan is completed (cross-completion with the regular task).
  readonly carePlanStepId?: string | undefined
}

const weatherAt = ({
  weather,
}: CareContext): Effect.Effect<
  Option.Option<WeatherContext>,
  never,
  WeatherProvider | WeatherCache | WeatherRepository
> =>
  !weather.enabled || !weather.latitude || !weather.longitude
    ? Effect.succeedNone
    : getWeatherContext(
        roundCoord(weather.latitude),
        roundCoord(weather.longitude)
      ).pipe(Effect.option)

const applyWeatherAdjustment = (
  weatherContext: Option.Option<WeatherContext>,
  { weather, timezone }: CareContext,
  plant: PlantForAdjustment,
  careType: CareType,
  nextCareAt: Date | undefined,
  nowDt: DateTime.Utc
): Date | undefined => {
  if (!nextCareAt || !weather.latitude || Option.isNone(weatherContext)) {
    return nextCareAt
  }

  const { currentWeather, recentHistory, forecast } = weatherContext.value

  const adjustment = calculatePlantAdjustment(
    plant,
    currentWeather,
    recentHistory,
    forecast,
    weather.latitude
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
}

export const publishEventsAfterCommit = <A, E, R>(
  transaction: Effect.Effect<A, E, R>
) =>
  Effect.gen(function* () {
    const eventBus = yield* EventBus
    const events = yield* Ref.make<ReadonlyArray<AppEvent>>([])
    const buffered: IEventBus = {
      publish: (event) => Ref.update(events, Array.append(event)),
      subscribe: eventBus.subscribe,
    }
    const result = yield* transaction.pipe(
      Effect.provideService(EventBus, buffered)
    )
    yield* Effect.forEach(
      yield* Ref.get(events),
      (event) => publishWithRetry(eventBus.publish(event)),
      { discard: true }
    )
    return result
  })

export const executePlantCare = (
  plant: PlantWithRoom,
  params: ExecutePlantCareParams
): Effect.Effect<
  PlantWithRoom,
  SqlError | FutureDateNotAllowedError | AlreadyCaredTodayError,
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
  | CarePlanRepository
  | CanopyRepository
  | SqlClient.SqlClient
> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const repo = yield* PlantRepository
    const scheduleRepo = yield* CareScheduleRepository
    const notificationRepo = yield* NotificationRepository
    const careLogRepo = yield* CareLogRepository
    const carePlanRepo = yield* CarePlanRepository

    const context = yield* careContext(plant.owner)
    const { timezone } = context

    const nowDt = DateTime.nowUnsafe()

    // Use provided date (past care) or current time
    const careDt = pipe(
      Option.fromNullishOr(params.date),
      Option.map((d) => DateTime.makeUnsafe(d)),
      Option.getOrElse(() => nowDt)
    )

    // Validate that the provided date is not in the future (1-minute tolerance for clock skew)
    if (
      DateTime.isGreaterThan(
        careDt,
        DateTime.addDuration(nowDt, Duration.minutes(1))
      )
    ) {
      return yield* new FutureDateNotAllowedError()
    }

    const careDate = DateTime.toDateUtc(careDt)
    const isPastCare = Option.isSome(Option.fromNullishOr(params.date))

    const weatherContext = isPastCare
      ? Option.none<WeatherContext>()
      : yield* weatherAt(context)

    const dayStart = startOfDay(careDt, timezone)
    const dayEnd = DateTime.addDuration(dayStart, Duration.days(1))
    const reminderType = `${params.careType}_reminder` as const
    const writeCare = Effect.gen(function* () {
      const careLog = yield* createCareLog(plant, {
        type: params.careType,
        notes: params.notes,
        date: careDate,
      })

      // Care-plan bridging: link the care log to the plan step it satisfies.
      const completedStep = yield* pipe(
        Option.fromNullishOr(params.carePlanStepId),
        Option.match({
          onNone: () =>
            carePlanRepo.completeEarliestOpenStep(
              params.plantId,
              params.careType,
              { completedAt: careDate, careLogId: careLog.id }
            ),
          onSome: (stepId) =>
            carePlanRepo.completeStep(stepId, {
              completedAt: careDate,
              careLogId: careLog.id,
            }),
        })
      )
      if (completedStep) {
        yield* carePlanRepo.settleCompletion(completedStep.planId)
      }

      // Get frequency from schedule table
      const schedule = yield* scheduleRepo.findByPlantAndType(
        params.plantId,
        params.careType
      )
      const frequency = pipe(
        Option.fromNullishOr(schedule),
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
        Option.fromNullishOr(frequency),
        Option.map((days) =>
          DateTime.toDateUtc(
            DateTime.addDuration(careDayStart, Duration.days(days))
          )
        ),
        Option.getOrUndefined
      )

      const finalNextCareAt = applyWeatherAdjustment(
        weatherContext,
        context,
        {
          id: plant.id,
          wateringFrequencyDays: pipe(
            Option.fromNullishOr(schedule),
            Option.map((s) => s.frequencyDays),
            Option.getOrElse(() => 7)
          ),
          wateringRating: plant.wateringRating,
          ...toIndoorPlantContext(plant),
        },
        params.careType,
        nextCareAt,
        nowDt
      )

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

      // Schedule next reminder if we have a next care date
      if (finalNextCareAt) {
        yield* reconcileCareReminder(plant.id, reminderType)
      }

      // Clear any pending overdue reminders — the user just performed care
      yield* notificationRepo.deletePendingByPlantsAndType(
        [params.plantId],
        'overdue_reminder'
      )

      return pipe(
        Option.fromNullishOr(refetched),
        Option.getOrElse(() => plant)
      )
    })

    return yield* sql
      .withTransaction(
        Effect.gen(function* () {
          yield* careLogRepo.lockPlantCareType(params.plantId, params.careType)
          const alreadyLogged = yield* careLogRepo.existsByPlantAndTypeInRange(
            params.plantId,
            params.careType,
            DateTime.toDateUtc(dayStart),
            DateTime.toDateUtc(dayEnd)
          )
          if (alreadyLogged) {
            return yield* new AlreadyCaredTodayError({
              careType: params.careType,
            })
          }
          return yield* withReminderKeys(
            reminderKeysFor([params.plantId], [reminderType])
          )(writeCare)
        })
      )
      .pipe(publishEventsAfterCommit)
  })
