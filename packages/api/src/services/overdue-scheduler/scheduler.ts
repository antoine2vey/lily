import { remindOverdue } from '@lily/api/contexts/reminders'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { createScheduler } from '@lily/api/services/helpers/create-scheduler'
import {
  dispatchNow,
  recordNotification,
} from '@lily/api/services/helpers/schedule-notification'
import {
  notificationSettingsOf,
  type UserNotificationSettings,
} from '@lily/api/services/plants/helpers/user-settings'
import { plantCapsFor } from '@lily/api/services/subscriptions/plant-caps'
import { DEFAULT_TIMEZONE, isOnVacation, nowAsDate } from '@lily/shared'
import { Array, Effect, Option, pipe, Record } from 'effect'

const timezoneOf = (settings: UserNotificationSettings) =>
  pipe(
    Option.fromNullishOr(settings.timezone),
    Option.getOrElse(() => DEFAULT_TIMEZONE)
  )

const nudgeOverflow = (
  userId: string,
  settings: UserNotificationSettings,
  overflowCount: number
) =>
  Effect.gen(function* () {
    if (
      !settings.careReminders ||
      !settings.tips ||
      isOnVacation(settings, nowAsDate())
    ) {
      return
    }
    const notificationRepo = yield* NotificationRepository
    const alreadySentNudge =
      yield* notificationRepo.hasNotificationOfTypesTodayForUser(
        userId,
        timezoneOf(settings),
        ['resubscribe_nudge']
      )
    if (alreadySentNudge) return
    yield* recordNotification(
      'resubscribe_nudge',
      userId,
      { plantCount: overflowCount },
      settings.language,
      {}
    ).pipe(Effect.flatMap(dispatchNow))
  })

/**
 * The hourly overdue pass. Reminders decides every row; this task supplies
 * the plan caps, and nudges whoever has plants their plan leaves out.
 */
export const checkAndCreateOverdueReminders = Effect.gen(function* () {
  const userRepo = yield* UserRepository

  yield* Effect.log('Running overdue reminder check...')

  const { outcomes, overflow } = yield* remindOverdue(plantCapsFor)

  const overflowing = yield* userRepo.findByIds(
    Array.map(overflow, ({ userId }) => userId)
  )
  yield* Effect.forEach(
    overflow,
    ({ userId, plants }) =>
      nudgeOverflow(
        userId,
        notificationSettingsOf(
          Array.findFirst(overflowing, (user) => user.id === userId).pipe(
            Option.getOrNull
          )
        ),
        plants
      ).pipe(
        Effect.catchTag('SqlError', (e) =>
          Effect.logWarning('[overdue-scheduler] Failed to nudge user', {
            userId,
            error: String(e),
          })
        )
      ),
    { concurrency: 10, discard: true }
  )

  const created = Array.reduce(
    outcomes,
    0,
    (sum, { reminded }) => sum + reminded
  )
  const skipped = pipe(
    outcomes,
    Array.flatMap(({ skipped }) => Option.toArray(skipped)),
    Array.groupBy((why): string => why),
    Record.map(Array.length)
  )
  if (created > 0 || !Record.isEmptyRecord(skipped)) {
    yield* Effect.log('Overdue reminders', { created, skipped })
  }
}).pipe(Effect.withSpan('overdue-scheduler.check'))

export const startOverdueScheduler = createScheduler({
  name: 'overdue-scheduler',
  interval: '1 hour',
  runOnStartup: true,
  task: checkAndCreateOverdueReminders,
})
