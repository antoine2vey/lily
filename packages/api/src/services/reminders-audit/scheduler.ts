import { redriveReminders, repairDrift } from '@lily/api/contexts/reminders'
import { createScheduler } from '@lily/api/services/helpers/create-scheduler'
import { DateTime, Effect, Option, Ref } from 'effect'

const DRIFT_PASS_FROM_HOUR_UTC = 3

/**
 * The daily replan runs on the first tick of a UTC day at or after 03:00.
 * `lastPassDay` is the UTC day of the last one this process ran, so a tick
 * that lands late still runs the day's pass, and a restart runs one more.
 */
export const isDriftPassDue = (
  now: DateTime.Utc,
  lastPassDay: Option.Option<string>
): boolean =>
  DateTime.getPartUtc(now, 'hour') >= DRIFT_PASS_FROM_HOUR_UTC &&
  !Option.contains(lastPassDay, DateTime.formatIsoDateUtc(now))

/**
 * Every hour: another round for what Reminders dead-lettered. Once a day:
 * a replan of every plant with a care due soon, whose changes are `drift`.
 */
export const auditReminders = (lastPassDay: Ref.Ref<Option.Option<string>>) =>
  Effect.gen(function* () {
    const redriven = yield* redriveReminders
    if (redriven > 0) {
      yield* Effect.logWarning('[reminders-audit] Dead letters redriven', {
        redriven,
      })
    }
    const now = yield* DateTime.now
    if (!isDriftPassDue(now, yield* Ref.get(lastPassDay))) return
    const { plants, drift } = yield* repairDrift
    yield* Ref.set(lastPassDay, Option.some(DateTime.formatIsoDateUtc(now)))
    yield* (drift > 0 ? Effect.logWarning : Effect.log)(
      '[reminders-audit] Daily replan',
      { plants, drift }
    )
  }).pipe(Effect.withSpan('reminders-audit.run'))

export const startRemindersAuditScheduler = Effect.flatMap(
  Ref.make(Option.none<string>()),
  (lastPassDay) =>
    createScheduler({
      name: 'reminders-audit',
      interval: '1 hour',
      runOnStartup: true,
      task: auditReminders(lastPassDay),
    })
)
