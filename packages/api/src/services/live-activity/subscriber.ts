import { type AppEvent, EventBus } from '@lily/api/events'
import { ActivityPushTokenRepository } from '@lily/api/repositories/activity-push-token.repository'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { buildLiveActivityContentState } from '@lily/api/services/care-tasks/helpers/group-tasks'
import { reminderRecipients } from '@lily/api/services/plants/helpers/reminder-recipients'
import type { CareType } from '@lily/shared'
import {
  type IPushService,
  type LiveActivityPushMessage,
  PushService,
} from '@lily/shared/server'
import { Array, Effect, Match, Option, Queue } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

// Send a Live Activity push and swallow all three push-error tags with
// uniform logging. On invalidation, optionally run a one-shot cleanup
// (used by the `update` path to mark the dead row ended).
const sendWithLogging = (
  pushService: IPushService,
  kind: 'end' | 'update',
  message: LiveActivityPushMessage,
  onInvalidated?: (reason: string) => Effect.Effect<void, SqlError>
) => {
  const warn = (suffix: string) => (e: { readonly message: string }) =>
    Effect.logWarning(`[live-activity] ${kind} ${suffix}: ${e.message}`)
  return pushService.sendLiveActivity(message).pipe(
    Effect.tap((ticket) =>
      Effect.log(`[live-activity] ${kind} push accepted by APNs`, {
        apnsId: ticket.id,
      })
    ),
    Effect.catchTags({
      PushSendError: warn('failed'),
      PushConfigError: warn('config error'),
      PushTokenInvalidatedError: (e) =>
        Effect.logInfo(
          `[live-activity] ${kind} token invalidated: ${e.reason}`
        ).pipe(
          Effect.andThen(
            Option.match(Option.fromNullishOr(onInvalidated), {
              onNone: () => Effect.void,
              onSome: (cb) => cb(e.reason),
            })
          )
        ),
    }),
    Effect.ignore
  )
}

const refreshLiveActivity = (params: {
  userId: string
  exclude?: { plantId: string; careType: CareType }
}) =>
  Effect.gen(function* () {
    const activityRepo = yield* ActivityPushTokenRepository
    const pushService = yield* PushService
    const active = yield* activityRepo.findActiveActivityByUserId(params.userId)
    if (!active) return

    // CareLogCreated excludes the just-completed (plantId, careType) pair —
    // the schedule row's nextCareAt hasn't been updated yet (execute-plant-care
    // does that AFTER publishing), so without this exclusion we'd count the
    // completed task as still due. Lifecycle events need no exclusion: the
    // plant row is committed before they are published and findPendingByUser
    // already skips dead plants.
    const contentState = yield* buildLiveActivityContentState(
      params.userId,
      params.exclude
    )

    const activityIdOpt = Option.fromNullishOr(active.activityId)
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

const refreshCardsFor = (params: {
  actorId: string
  plantId: string
  exclude?: { plantId: string; careType: CareType }
}) =>
  Effect.gen(function* () {
    const plantRepo = yield* PlantRepository
    const plant = yield* plantRepo.findById(params.plantId)
    const recipients = plant === null ? [] : yield* reminderRecipients(plant)
    yield* Effect.forEach(
      Array.dedupe([params.actorId, ...recipients]),
      (userId) =>
        refreshLiveActivity({
          userId,
          ...(params.exclude ? { exclude: params.exclude } : {}),
        }),
      { discard: true }
    )
  })

// CareLogCreated and PlantLifecycleChanged are load-bearing for LA; other
// variants are no-ops.
export const processEvent = (event: AppEvent) =>
  Match.value(event).pipe(
    Match.tag('CareLogCreated', (e) =>
      refreshCardsFor({
        actorId: e.userId,
        plantId: e.plantId,
        exclude: { plantId: e.plantId, careType: e.type },
      })
    ),
    Match.tag('PlantLifecycleChanged', (e) =>
      refreshCardsFor({ actorId: e.userId, plantId: e.plantId })
    ),
    Match.orElse(() => Effect.void)
  )

export const startLiveActivitySubscriber = Effect.gen(function* () {
  const eventBus = yield* EventBus
  const queue = yield* eventBus.subscribe

  yield* Effect.forkScoped(
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
