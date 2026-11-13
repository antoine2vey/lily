import { type CapOf, remindOverdue } from '@lily/api/contexts/reminders'
import { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { SubscriptionRepository } from '@lily/api/repositories/subscription.repository'
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
import { canopyPlantCapFrom } from '@lily/api/services/subscriptions/canopy-plant-cap'
import { hasPremiumAccess } from '@lily/api/services/subscriptions/has-premium-access'
import {
  DEFAULT_TIMEZONE,
  isOnVacation,
  nowAsDate,
  type PlantOwner,
} from '@lily/shared'
import { Array, Effect, Filter, Match, Option, pipe, Record } from 'effect'

const timezoneOf = (settings: UserNotificationSettings) =>
  pipe(
    Option.fromNullishOr(settings.timezone),
    Option.getOrElse(() => DEFAULT_TIMEZONE)
  )

const subscriptionCaps = (owners: ReadonlyArray<PlantOwner>) =>
  Effect.gen(function* () {
    const canopyRepo = yield* CanopyRepository
    const subRepo = yield* SubscriptionRepository

    const membersByCanopy = yield* canopyRepo.findMemberIdsByCanopyIds(
      pipe(
        owners,
        Array.filterMap(
          Filter.fromPredicateOption((owner) =>
            owner._tag === 'Canopy'
              ? Option.some(owner.canopyId)
              : Option.none()
          )
        ),
        Array.dedupe
      )
    )
    const userIds = pipe(
      Record.values(membersByCanopy),
      Array.flatten,
      Array.appendAll(
        Array.filterMap(
          owners,
          Filter.fromPredicateOption((owner) =>
            owner._tag === 'User' ? Option.some(owner.userId) : Option.none()
          )
        )
      ),
      Array.dedupe
    )
    const [subscriptions, allTiers] = yield* Effect.all([
      subRepo.findByUserIds(userIds),
      subRepo.getAllTiers(),
    ])

    const subByUserId = pipe(
      subscriptions,
      Array.groupBy((sub) => sub.userId),
      Record.map(Array.head)
    )
    const tierByName = pipe(
      allTiers,
      Array.groupBy((t): string => t.tier),
      Record.map((tiers) => pipe(Array.head(tiers), Option.getOrUndefined))
    )
    const freeTierMaxPlants = tierByName.free?.maxPlants ?? 5

    const maxPlantsOfUser = (userId: string): number | null =>
      pipe(
        Record.get(subByUserId, userId),
        Option.flatten,
        Option.filter(hasPremiumAccess),
        Option.match({
          onNone: () => freeTierMaxPlants,
          onSome: (sub) => tierByName[sub.tier]?.maxPlants ?? null,
        })
      )

    const maxPlantsOfCanopy = Record.map(membersByCanopy, (members) =>
      canopyPlantCapFrom(Array.map(members, maxPlantsOfUser), freeTierMaxPlants)
    )

    const capOf: CapOf = (owner) =>
      Option.fromNullishOr(
        Match.value(owner).pipe(
          Match.tag('User', ({ userId }) => maxPlantsOfUser(userId)),
          Match.tag('Canopy', ({ canopyId }) =>
            pipe(
              Record.get(maxPlantsOfCanopy, canopyId),
              Option.getOrElse((): number | null => freeTierMaxPlants)
            )
          ),
          Match.exhaustive
        )
      )
    return capOf
  })

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
      yield* notificationRepo.hasNotificationOfTypeTodayForUser(
        userId,
        timezoneOf(settings),
        'resubscribe_nudge'
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

  const { outcomes, overflow } = yield* remindOverdue(subscriptionCaps)

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
