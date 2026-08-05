import type { SqlError } from '@effect/sql/SqlError'
import { UserRepository } from '@lily/api/repositories/user.repository'
import type { LanguageCode, VacationStatus } from '@lily/shared'
import { Effect, Option, pipe } from 'effect'

export interface UserNotificationSettings {
  timezone: string | null
  preferredTime: string | null
  careReminders: boolean
  doNotDisturb: boolean
  doNotDisturbStart: string | null
  doNotDisturbEnd: string | null
  language: LanguageCode
  vacationStatus: VacationStatus
  vacationStart: Date | null
  vacationEnd: Date | null
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

    const language = pipe(
      userOption,
      Option.flatMap((u) => Option.fromNullable(u.language)),
      Option.getOrElse(() => 'en' as const)
    )

    const vacationStatus = pipe(
      userOption,
      Option.map((u) => u.vacationStatus),
      Option.getOrElse(() => 'none' as const)
    )
    const vacationStart = pipe(
      userOption,
      Option.flatMap((u) => Option.fromNullable(u.vacationStart)),
      Option.getOrNull
    )
    const vacationEnd = pipe(
      userOption,
      Option.flatMap((u) => Option.fromNullable(u.vacationEnd)),
      Option.getOrNull
    )

    return {
      timezone,
      preferredTime,
      careReminders,
      doNotDisturb,
      doNotDisturbStart,
      doNotDisturbEnd,
      language,
      vacationStatus,
      vacationStart,
      vacationEnd,
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
