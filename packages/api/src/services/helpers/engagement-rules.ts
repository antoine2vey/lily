import {
  NotificationRepository,
  type NotificationWindow,
} from '@lily/api/repositories/notification.repository'
import { resolveTimezone } from '@lily/api/services/helpers/resolve-timezone'
import { recordNotificationAt } from '@lily/api/services/helpers/schedule-notification'
import type { ParamsOf } from '@lily/api/services/notification-scheduler/translations'
import {
  daysAgoAsDate,
  type LanguageCode,
  pickUpcomingNotificationTime,
} from '@lily/shared'
import { Array, Data, Effect, Option, pipe, Random, Ref } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export class SkipUserError extends Data.TaggedError('SkipUserError')<{
  readonly reason: string
}> {}

type EngagementTopic =
  | 'inactivity_nudge'
  | 'photo_reminder'
  | 'plant_parent_milestone'
  | 'streak_at_risk'
  | 'streak_milestone'
  | 'trial_ending'
  | 'plant_anniversary'
  | 'weekly_recap'
  | 'daily_tip'

/** A notification a rule owes a user. */
export type Nudge = {
  readonly [T in EngagementTopic]: {
    readonly topic: T
    readonly params: ParamsOf<T>
    readonly plantId?: string
  }
}[EngagementTopic]

export interface Recipient {
  readonly id: string
  readonly timezone: string | null
  readonly doNotDisturb: boolean
  readonly doNotDisturbStart: string | null
  readonly doNotDisturbEnd: string | null
  readonly language: LanguageCode
}

export interface EngagementRule<U extends Recipient, R> {
  /** The tag of the rule's log lines. */
  readonly name: string
  /**
   * The nudges owed to the user, given their resolved zone. They share one
   * slot, so they go out in one push. SkipUserError names why there are
   * none, and the run logs it. An empty list is logged nowhere: it is for the
   * rule that concerns few of its users on a given day.
   */
  readonly decide: (
    user: U,
    timezone: string
  ) => Effect.Effect<ReadonlyArray<Nudge>, SkipUserError | SqlError, R>
}

/** Rows of `topic` recorded for the user in the last `days` days, waiting ones included. */
export const sinceDaysAgo = (
  userId: string,
  topic: EngagementTopic,
  days: number
): NotificationWindow => ({
  userId,
  topics: [topic],
  counting: 'produced',
  from: daysAgoAsDate(days),
})

export const unlessNotified = (window: NotificationWindow) =>
  Effect.gen(function* () {
    const notifications = yield* NotificationRepository
    if (yield* notifications.hasNotificationIn(window)) {
      return yield* new SkipUserError({ reason: 'already_sent' })
    }
  })

const runRule = <U extends Recipient, R>(
  schedulerName: string,
  users: ReadonlyArray<U>,
  rule: EngagementRule<U, R>
) =>
  Effect.gen(function* () {
    const created = yield* Ref.make(0)
    const label = `[${schedulerName}]`

    yield* Effect.forEach(
      users,
      (user) =>
        Effect.gen(function* () {
          const timezone = resolveTimezone(user.timezone)
          const nudges = yield* rule.decide(user, timezone)
          if (Array.isReadonlyArrayEmpty(nudges)) return
          // A slot already past would be delivered at once, at any hour of the
          // night. With no window left today, a run of the next local day
          // takes the user.
          const scheduledAt = yield* pipe(
            yield* pickUpcomingNotificationTime(
              { ...user, timezone },
              yield* Random.next
            ),
            Option.match({
              onNone: () => new SkipUserError({ reason: 'slot_passed' }),
              onSome: Effect.succeed,
            })
          )
          yield* Effect.forEach(
            nudges,
            ({ topic, params, plantId }) =>
              recordNotificationAt(
                topic,
                user.id,
                params,
                user.language,
                {},
                plantId === undefined
                  ? { scheduledAt }
                  : { scheduledAt, plantId }
              ),
            { discard: true }
          )
          yield* Ref.update(created, (n) => n + 1)
        }).pipe(
          Effect.catchTags({
            SkipUserError: (e) =>
              Effect.log(`${label} Skipped user (${rule.name})`, {
                reason: e.reason,
                userId: user.id,
              }),
            DndWindowBlockedError: () =>
              Effect.log(`${label} Skipped — DND window (${rule.name})`, {
                userId: user.id,
              }),
            SqlError: (e) =>
              Effect.logWarning(`${label} Item failed (${rule.name})`, {
                userId: user.id,
                error: String(e),
              }),
          })
        ),
      { concurrency: 10, discard: true }
    )

    const total = yield* Ref.get(created)
    if (total > 0) {
      yield* Effect.log(`${label} Created ${rule.name} notifications`, {
        count: total,
      })
    }
  }).pipe(Effect.withSpan(`${schedulerName}.${rule.name}`))

/**
 * Runs each rule over the users in turn: the rule decides what a user is
 * owed, then the runner picks one slot for it, later today in the user's
 * zone, and records it. A user the rule skips, whom do-not-disturb blocks,
 * whose windows of the day are over or whose query fails is logged and
 * passed over.
 */
export const runRules = <U extends Recipient, R>(
  schedulerName: string,
  users: ReadonlyArray<U>,
  rules: ReadonlyArray<EngagementRule<U, R>>
) =>
  Effect.forEach(rules, (rule) => runRule(schedulerName, users, rule), {
    discard: true,
  })
