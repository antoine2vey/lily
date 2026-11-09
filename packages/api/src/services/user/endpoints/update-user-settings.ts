import type { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import type { CareScheduleRepository } from '@lily/api/repositories/care-schedule.repository'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import type { RecipientRepository } from '@lily/api/repositories/recipient.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { lockMyCanopy } from '@lily/api/services/canopy/helpers/membership'
import {
  canopyPlantIdsOf,
  rebuildMemberReminders,
  rescheduleReminders,
} from '@lily/api/services/plants/helpers/reconcile-reminders'
import {
  reminderKeysFor,
  withReminderKeys,
} from '@lily/api/services/plants/helpers/reminder-keys'
import type { RateLimitExceededError } from '@lily/api/services/rate-limiter/errors'
import type { RateLimiterService } from '@lily/api/services/rate-limiter/service'
import {
  claimUsername,
  usernameTakenOnConflict,
} from '@lily/api/services/username/claim-username'
import { type AuthError, compact, trimAndNullify } from '@lily/shared'
import { UserNotFoundError } from '@lily/shared/errors/user'
import { CARE_TOPICS, ENGAGEMENT_TOPICS } from '@lily/shared/server'
import type { UserSettings, UserSettingsUpdateRequest } from '@lily/shared/user'
import { Array, Effect, Option, pipe } from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

const lockReminderPlantsOf = (userId: string) =>
  Effect.gen(function* () {
    const plantRepo = yield* PlantRepository
    const inCanopy = yield* lockMyCanopy(userId).pipe(
      Effect.as(true),
      Effect.catchTag('CanopyNotFoundError', () => Effect.succeed(false))
    )
    return {
      personal: yield* plantRepo.findPersonalReminderPlantIds(userId),
      canopy: inCanopy ? yield* canopyPlantIdsOf(userId) : [],
    }
  })

// Update user settings (profile + notification preferences)
export const updateUserSettings = (
  data: UserSettingsUpdateRequest
): Effect.Effect<
  UserSettings,
  SqlError | UserNotFoundError | AuthError | RateLimitExceededError,
  | UserRepository
  | RateLimiterService
  | CurrentUser
  | NotificationRepository
  | CareScheduleRepository
  | CareLogRepository
  | PlantRepository
  | CanopyRepository
  | RecipientRepository
  | SqlClient.SqlClient
> =>
  Effect.gen(function* () {
    const { id } = yield* CurrentUser
    const repo = yield* UserRepository
    const notificationRepo = yield* NotificationRepository
    const careLogRepo = yield* CareLogRepository

    // Get current user settings to check if timezone/time changed
    const existingUser = yield* repo.findById(id)
    if (!existingUser) {
      return yield* new UserNotFoundError()
    }

    // firstName: empty/whitespace is silently dropped (no-op). UI enforces
    // required-on-edit, so this is defense-in-depth.
    const trimmedFirst = pipe(
      Option.fromNullishOr(trimAndNullify(data.firstName)),
      Option.getOrUndefined
    )
    // lastName: undefined = leave unchanged, anything else passes through
    // trimAndNullify (whitespace collapses to null = clear the field).
    const lastNameUpdate =
      data.lastName === undefined ? undefined : trimAndNullify(data.lastName)

    const name =
      data.name === undefined
        ? undefined
        : yield* claimUsername(existingUser, data.name)

    const updateData = compact({
      name,
      firstName: trimmedFirst,
      lastName: lastNameUpdate,
      image: data.image,
      bio: data.bio,
      careReminders: data.notifications?.careReminders,
      weeklyDigest: data.notifications?.weeklyDigest,
      achievementNotifications: data.notifications?.achievements,
      tips: data.notifications?.tips,
      productUpdates: data.notifications?.productUpdates,
      ads: data.notifications?.ads,
      doNotDisturb: data.notifications?.doNotDisturb,
      doNotDisturbStart: data.notifications?.doNotDisturbStart,
      doNotDisturbEnd: data.notifications?.doNotDisturbEnd,
      publicProfile: data.privacy?.publicProfile,
      shareGrowthData: data.privacy?.shareGrowthData,
      personalizedTips: data.privacy?.personalizedTips,
      temperatureUnit: data.temperatureUnit,
      weatherEnabled: data.weather?.enabled,
      latitude: data.weather?.latitude,
      longitude: data.weather?.longitude,
      timezone: data.timezone,
      preferredNotificationTime: data.preferredNotificationTime,
      language: data.language,
    })

    const timezoneChanged =
      data.timezone !== undefined && data.timezone !== existingUser.timezone
    const timeChanged =
      data.preferredNotificationTime !== undefined &&
      data.preferredNotificationTime !== existingUser.preferredNotificationTime
    const careRemindersTurnedOn =
      data.notifications?.careReminders === true && !existingUser.careReminders
    const rebuildReminders =
      timezoneChanged || timeChanged || careRemindersTurnedOn

    const applyUpdate = Effect.gen(function* () {
      const updated = yield* usernameTakenOnConflict(
        repo.update(id, updateData)
      )
      if (!updated) {
        return yield* new UserNotFoundError()
      }
      if (data.notifications?.careReminders === false) {
        yield* notificationRepo.deletePendingByUserIdAndTypes(id, CARE_TOPICS)
      }
      if (data.notifications?.tips === false) {
        yield* notificationRepo.deletePendingByUserIdAndTypes(
          id,
          ENGAGEMENT_TOPICS
        )
      }
      return updated
    })

    const sql = yield* SqlClient.SqlClient
    const user = rebuildReminders
      ? yield* sql.withTransaction(
          Effect.gen(function* () {
            const { personal, canopy } = yield* lockReminderPlantsOf(id)
            return yield* withReminderKeys(
              reminderKeysFor(Array.dedupe([...personal, ...canopy])),
              Option.some(id)
            )(
              applyUpdate.pipe(
                Effect.tap(() =>
                  rescheduleReminders(personal).pipe(
                    Effect.andThen(rebuildMemberReminders(id, canopy))
                  )
                )
              )
            )
          })
        )
      : yield* sql.withTransaction(applyUpdate)

    const careLogsCount = yield* careLogRepo.countByUser(id)

    return {
      name: user.name,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      image: pipe(Option.fromNullishOr(user.image), Option.getOrUndefined),
      bio: pipe(Option.fromNullishOr(user.bio), Option.getOrUndefined),
      notifications: {
        careReminders: user.careReminders,
        weeklyDigest: user.weeklyDigest,
        achievements: user.achievementNotifications,
        tips: user.tips,
        productUpdates: user.productUpdates,
        ads: user.ads,
        doNotDisturb: user.doNotDisturb,
        doNotDisturbStart: pipe(
          Option.fromNullishOr(user.doNotDisturbStart),
          Option.getOrElse(() => '22:00')
        ),
        doNotDisturbEnd: pipe(
          Option.fromNullishOr(user.doNotDisturbEnd),
          Option.getOrElse(() => '07:00')
        ),
      },
      privacy: {
        publicProfile: user.publicProfile,
        shareGrowthData: user.shareGrowthData,
        personalizedTips: user.personalizedTips,
      },
      timezone: user.timezone,
      preferredNotificationTime: user.preferredNotificationTime,
      language: user.language,
      temperatureUnit: user.temperatureUnit,
      weather: {
        enabled: user.weatherEnabled,
        latitude: pipe(Option.fromNullishOr(user.latitude), Option.getOrNull),
        longitude: pipe(Option.fromNullishOr(user.longitude), Option.getOrNull),
      },
      careLogsCount,
    }
  }).pipe(Effect.withSpan('UserService.updateUserSettings'))
