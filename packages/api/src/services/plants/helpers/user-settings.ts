import type { SqlError } from '@effect/sql/SqlError'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { Effect, Option, pipe } from 'effect'

export interface UserNotificationSettings {
  timezone: string | null
  preferredTime: string | null
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

    const timezone = pipe(
      Option.fromNullable(user),
      Option.flatMap((u) => Option.fromNullable(u.timezone)),
      Option.getOrNull
    )
    const preferredTime = pipe(
      Option.fromNullable(user),
      Option.flatMap((u) => Option.fromNullable(u.preferredNotificationTime)),
      Option.getOrNull
    )

    return { timezone, preferredTime }
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
