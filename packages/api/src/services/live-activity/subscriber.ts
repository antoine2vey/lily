import type { SqlError } from '@effect/sql/SqlError'
import { type AppEvent, EventBus } from '@lily/api/events'
import { ActivityPushTokenRepository } from '@lily/api/repositories/activity-push-token.repository'
import { buildLiveActivityContentState } from '@lily/api/services/care-tasks/helpers/group-tasks'
import type { CareType } from '@lily/shared'
import {
  type IPushService,
  type LiveActivityPushMessage,
  PushService,
} from '@lily/shared/server'
import { Effect, Match, Option, Queue } from 'effect'

// Send a Live Activity push and swallow all three push-error tags with
// uniform logging. On invalidation, optionally run a one-shot cleanup
// (used by the `update` path to mark the dead row ended).
const sendWithLogging = (
  pushService: IPushService,
  kind: 'end' | 'update',
  message: LiveActivityPushMessage,
  onInvalidated?: (reason: string) => Effect.Effect<void, SqlError>
) =>
  pushService.sendLiveActivity(message).pipe(
    Effect.tap((ticket) =>
      Effect.log(`[live-activity] ${kind} push accepted by APNs`, {
        apnsId: ticket.id,
      })
    ),
    Effect.catchTags({
      PushSendError: (e) =>
        Effect.logWarning(`[live-activity] ${kind} failed`, {
          error: String(e),
        }),
      PushConfigError: (e) =>
        Effect.logWarning(`[live-activity] ${kind} config error`, {
          error: String(e),
        }),
      PushTokenInvalidatedError: (e) =>
        Effect.gen(function* () {
          yield* Effect.logInfo(`[live-activity] ${kind} token invalidated`, {
            reason: e.reason,
          })
          if (onInvalidated) yield* onInvalidated(e.reason)
        }),
    }),
    Effect.ignore
  )

const refreshLiveActivity = (event: {
  userId: string
  plantId: string
  type: CareType
}) =>
  Effect.gen(function* () {
    const activityRepo = yield* ActivityPushTokenRepository
    const pushService = yield* PushService
    const active = yield* activityRepo.findActiveActivityByUserId(event.userId)
    if (!active) return

    // Exclude the just-completed (plantId, careType) pair — the schedule
    // row's nextCareAt hasn't been updated yet (execute-plant-care does
    // that AFTER publishing CareLogCreated), so without this exclusion we'd
    // count the completed task as still due.
    const contentState = yield* buildLiveActivityContentState(event.userId, {
      plantId: event.plantId,
      careType: event.type,
    })

    const activityIdOpt = Option.fromNullable(active.activityId)
    const markEnded = Option.match(activityIdOpt, {
      onNone: () => Effect.void,
      onSome: (id) => Effect.asVoid(activityRepo.markEnded(id)),
    })

    if (!contentState) {
      yield* markEnded
      yield* sendWithLogging(pushService, 'end', {
        _tag: 'LiveActivityEnd',
        to: active.token,
        dismissalPolicy: 'immediate',
      })
      return
    }

    // Still remaining → update. If the update token is dead, mark the row
    // ended so the next care cycle takes the start path instead of trying
    // to update a dead activity.
    yield* sendWithLogging(
      pushService,
      'update',
      {
        _tag: 'LiveActivityUpdate',
        to: active.token,
        contentState,
      },
      () => markEnded
    )
  })

// Only CareLogCreated is load-bearing for LA; other variants are no-ops.
export const processEvent = (event: AppEvent) =>
  Match.value(event).pipe(
    Match.tag('CareLogCreated', (e) => refreshLiveActivity(e)),
    Match.orElse(() => Effect.void)
  )

export const startLiveActivitySubscriber = Effect.gen(function* () {
  const eventBus = yield* EventBus
  const queue = yield* eventBus.subscribe

  yield* Effect.fork(
    Effect.forever(
      Effect.gen(function* () {
        const event = yield* Queue.take(queue)
        yield* processEvent(event).pipe(
          Effect.withSpan('live-activity.process', {
            attributes: { 'event._tag': event._tag },
          }),
          Effect.catchTag('SqlError', (e) =>
            Effect.logWarning('[live-activity] event processing failed', {
              error: String(e),
            })
          )
        )
      })
    )
  )
})
