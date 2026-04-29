import { ActivityPushTokenRepository } from '@lily/api/repositories/activity-push-token.repository'
import { buildLiveActivityContentState } from '@lily/api/services/care-tasks/helpers/group-tasks'
import { createScheduler } from '@lily/api/services/helpers/create-scheduler'
import { PushService } from '@lily/shared/server'
import { DateTime, Duration, Effect } from 'effect'

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

const expireStaleActivities = Effect.gen(function* () {
  const repo = yield* ActivityPushTokenRepository
  const cutoff = DateTime.toDateUtc(
    DateTime.subtractDuration(DateTime.unsafeNow(), SOFT_TTL)
  )
  const count = yield* repo.expireStaleOlderThan(cutoff)
  if (count > 0) {
    yield* Effect.log(
      `[activity-scheduler] Expired ${count} stale activity tokens`
    )
  }
})

// Safety-net for dropped CareLogCreated events — the Redis pub/sub EventBus
// is fire-and-forget, so a missed event can leave a stuck activity. This
// re-derives each user's backlog and ends any row whose backlog is empty.
// Idempotent on already-ended rows.
const reconcileActiveActivities = Effect.gen(function* () {
  const activityRepo = yield* ActivityPushTokenRepository
  const pushService = yield* PushService

  const active = yield* activityRepo.findAllActiveUpdateTokens()
  if (active.length === 0) return

  let endedCount = 0
  yield* Effect.forEach(
    active,
    (row) =>
      Effect.gen(function* () {
        const contentState = yield* buildLiveActivityContentState(row.userId)
        if (contentState) return // backlog still has work, leave alone

        if (row.activityId) {
          yield* activityRepo.markEnded(row.activityId)
        }
        // DB row is already marked ended; any push error (terminal or
        // transient) is acceptable — next care cycle takes the start path.
        yield* pushService
          .sendLiveActivity({
            _tag: 'LiveActivityEnd',
            to: row.token,
            dismissalPolicy: 'immediate',
          })
          .pipe(
            Effect.catchTags({
              PushSendError: () => Effect.void,
              PushConfigError: () => Effect.void,
              PushTokenInvalidatedError: () => Effect.void,
            })
          )
        endedCount++
      }),
    { concurrency: 4 }
  )

  if (endedCount > 0) {
    yield* Effect.log(
      `[activity-scheduler] Reconciled ${endedCount} stuck activities`
    )
  }
})

const expireStaleStartTokens = Effect.gen(function* () {
  const repo = yield* ActivityPushTokenRepository
  const now = DateTime.unsafeNow()
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
