import { ActivityPushTokenRepository } from '@lily/api/repositories/activity-push-token.repository'
import { buildLiveActivityContentState } from '@lily/api/services/care-tasks/helpers/group-tasks'
import { createScheduler } from '@lily/api/services/helpers/create-scheduler'
import { PushService } from '@lily/shared/server'
import { DateTime, Duration, Effect } from 'effect'

// 10h leaves headroom under Apple's 12h hard cap; expiring the row forces
// the next cycle to take the `start` path instead of attempting an update.
const SOFT_TTL = Duration.hours(10)

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

const runTasks = Effect.gen(function* () {
  yield* expireStaleActivities
  yield* reconcileActiveActivities
})

export const startActivityScheduler = createScheduler({
  name: 'activity-scheduler',
  // Balance: self-heal within minutes vs. avoid spamming cross-user queries.
  interval: '5 minutes',
  runOnStartup: false,
  task: runTasks,
})
