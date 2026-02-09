import type { SqlError } from '@effect/sql/SqlError'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { Effect, Option, pipe } from 'effect'

export interface UserNotificationSettings {
  timezone: string | null
  preferredTime: string | null
  careReminders: boolean
  doNotDisturb: boolean
  doNotDisturbStart: string | null
  doNotDisturbEnd: string | null
}

/**
 * Get user timezone and notification settings for scheduling care reminders
 */
export const getUserNotificationSettings = (
  userId: string
): Effect.Effect<UserNotificationSettings, SqlError, UserRepository> =>
  Effect.gen(function* () {
    const userRepo = yield* UserRepository
    const user = yield* userRepo.findById(userId)

    const userOption = Option.fromNullable(user)

    const timezone = pipe(
      userOption,
      Option.flatMap((u) => Option.fromNullable(u.timezone)),
      Option.getOrNull
    )
    const preferredTime = pipe(
      userOption,
      Option.flatMap((u) => Option.fromNullable(u.preferredNotificationTime)),
      Option.getOrNull
    )
    const careReminders = pipe(
      userOption,
      Option.map((u) => u.careReminders),
      Option.getOrElse(() => true)
    )
    const doNotDisturb = pipe(
      userOption,
      Option.map((u) => u.doNotDisturb),
      Option.getOrElse(() => false)
    )
    const doNotDisturbStart = pipe(
      userOption,
      Option.flatMap((u) => Option.fromNullable(u.doNotDisturbStart)),
      Option.getOrNull
    )
    const doNotDisturbEnd = pipe(
      userOption,
      Option.flatMap((u) => Option.fromNullable(u.doNotDisturbEnd)),
      Option.getOrNull
    )

    return {
      timezone,
      preferredTime,
      careReminders,
      doNotDisturb,
      doNotDisturbStart,
      doNotDisturbEnd,
    }
  })

/**
 * Get user timezone with a default fallback
 */
export const getUserTimezone = (
  userId: string,
  defaultTimezone = 'UTC'
): Effect.Effect<string, SqlError, UserRepository> =>
  Effect.gen(function* () {
    const { timezone } = yield* getUserNotificationSettings(userId)
    return pipe(
      Option.fromNullable(timezone),
      Option.getOrElse(() => defaultTimezone)
    )
  })
