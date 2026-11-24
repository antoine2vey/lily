import { ActivityPushTokenRepository } from '@lily/api/repositories/activity-push-token.repository'
import { createScheduler } from '@lily/api/services/helpers/create-scheduler'
import { syncCards } from '@lily/api/services/live-activity/cards'
import { Array, DateTime, Duration, Effect } from 'effect'

// 10h leaves headroom under Apple's 12h hard cap; expiring the row forces
// the next cycle to take the `start` path instead of attempting an update.
const SOFT_TTL = Duration.hours(10)

// Apple rotates push-to-start tokens on undocumented heuristics; we observed
// rotation in <2 days. A start-token that has never been confirmed by a
// matching `update` registration in 14d is overwhelmingly likely dead on
// device — the alternative is a user who installed the app, registered, and
// never opened it again. Either way, future sends are wasted.
const UNCONFIRMED_TTL = Duration.days(14)
// A confirmed token going 30d without a fresh confirmation almost certainly
// rotated device-side; new push attempts would silently fail.
const CONFIRMED_TTL = Duration.days(30)

export const expireStaleActivities = Effect.gen(function* () {
  const repo = yield* ActivityPushTokenRepository
  const cutoff = DateTime.toDateUtc(
    DateTime.subtractDuration(DateTime.nowUnsafe(), SOFT_TTL)
  )
  const count = yield* repo.expireStaleOlderThan(cutoff)
  if (count > 0) {
    yield* Effect.log(
      `[activity-scheduler] Expired ${count} stale activity tokens`
    )
  }
})

// Safety net for a dropped CareLogCreated: the Redis EventBus is
// fire-and-forget, so a missed event can leave a card up after its backlog
// emptied. A card with work is left alone, since an update every sweep would
// spend the user's APNs budget for priority-10 pushes.
export const reconcileActiveActivities = Effect.gen(function* () {
  const activityRepo = yield* ActivityPushTokenRepository
  const active = yield* activityRepo.findAllActiveUpdateTokens
  const users = Array.dedupe(Array.map(active, (row) => row.userId))
  const ended = yield* Effect.forEach(
    users,
    (userId) => syncCards(userId, 'keep'),
    { concurrency: 4 }
  )
  const endedCount = Array.length(Array.flatten(ended))
  if (endedCount > 0) {
    yield* Effect.log(
      `[activity-scheduler] Reconciled ${endedCount} stuck activities`
    )
  }
})

const expireStaleStartTokens = Effect.gen(function* () {
  const repo = yield* ActivityPushTokenRepository
  const now = DateTime.nowUnsafe()
  const count = yield* repo.expireUnconfirmedStartTokens({
    unconfirmedOlderThan: DateTime.toDateUtc(
      DateTime.subtractDuration(now, UNCONFIRMED_TTL)
    ),
    confirmedOlderThan: DateTime.toDateUtc(
      DateTime.subtractDuration(now, CONFIRMED_TTL)
    ),
  })
  if (count > 0) {
    yield* Effect.log(
      `[activity-scheduler] Expired ${count} stale start tokens`
    )
  }
})

const runTasks = Effect.gen(function* () {
  yield* expireStaleActivities
  yield* expireStaleStartTokens
  yield* reconcileActiveActivities
})

export const startActivityScheduler = createScheduler({
  name: 'activity-scheduler',
  // Balance: self-heal within minutes vs. avoid spamming cross-user queries.
  interval: '5 minutes',
  runOnStartup: false,
  task: runTasks,
})
