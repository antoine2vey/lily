import type { CareReads } from '@lily/api/contexts/care'
import { ActivityPushTokenRepository } from '@lily/api/repositories/activity-push-token.repository'
import type { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import type { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import type { UserRepository } from '@lily/api/repositories/user.repository'
import { buildLiveActivityContentState } from '@lily/api/services/care-tasks/helpers/group-tasks'
import { retireStartTokenForDevice } from '@lily/api/services/live-activity/retire-start-token'
import { PushService } from '@lily/api/services/push/service'
import {
  LA_START_EXPIRATION,
  type LiveActivityAlert,
  type LiveActivityContentState,
  type LiveActivityPushMessage,
} from '@lily/api/services/push/types'
import type { ActivityPushToken } from '@lily/shared'
import { Array, DateTime, Duration, Effect, Match, Option, pipe } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

// How long a push-to-start we dispatched is presumed to still be alive on
// the device. A started activity only becomes visible to us once the device
// registers its update token, and that registration needs the app to run in
// the foreground with an unlocked keychain — a push-to-start that lands while
// the phone sits on the nightstand is confirmed hours later, if at all. Until
// that confirmation arrives, every further care message for the user (the
// overdue digest at a random morning slot, then the regular reminder at the
// preferred time) falls through to the start path and creates another
// identical card, and the server has no update token to end the first one.
// So the guard spans the longest the card can stay on screen: iOS keeps a
// Live Activity 8h, then up to 4h ended on the Lock Screen, and APNs may
// deliver the start up to LA_START_EXPIRATION after we sent it. That stays
// under the 24h cadence of the next day's reminder.
const LA_START_COOLDOWN = Duration.sum(Duration.hours(12), LA_START_EXPIRATION)

export type CardOutcome =
  | { readonly kind: 'accepted'; readonly apnsId: string }
  | {
      readonly kind: 'send-error' | 'config-error' | 'token-invalidated'
      readonly reason: string
    }

export interface CardPush {
  readonly push: 'start' | 'update' | 'end'
  readonly deviceTokenId: string
  readonly outcome: CardOutcome
}

export interface CardSync {
  // False when nothing is due: every running card was ended.
  readonly due: boolean
  readonly pushes: ReadonlyArray<CardPush>
}

export interface CardStart {
  readonly alert: (state: LiveActivityContentState) => LiveActivityAlert
  // The admin trigger forces a start past an earlier unconfirmed one. It
  // still stamps the device, so the next care push honors the guard.
  readonly bypassCooldown: boolean
}

type CardDeps =
  | ActivityPushTokenRepository
  | PushService
  | CareLogRepository
  | CareReads
  | UserRepository
  | CanopyRepository

// One push with its three errors folded into the outcome. A token APNs calls
// dead runs `onInvalidated`; a failed cleanup is logged and retried by the
// next push to that token, so one device never cancels the others' pushes.
const pushCard = (
  push: CardPush['push'],
  deviceTokenId: string,
  message: LiveActivityPushMessage,
  onInvalidated: Effect.Effect<unknown, SqlError, ActivityPushTokenRepository>
): Effect.Effect<CardPush, never, PushService | ActivityPushTokenRepository> =>
  Effect.gen(function* () {
    const pushService = yield* PushService
    const outcome = yield* pushService.sendLiveActivity(message).pipe(
      Effect.map(
        (ticket): CardOutcome => ({
          kind: 'accepted',
          apnsId: ticket.id,
        })
      ),
      Effect.catchTags({
        PushSendError: (e) =>
          Effect.succeed<CardOutcome>({
            kind: 'send-error',
            reason: e.message,
          }),
        PushConfigError: (e) =>
          Effect.succeed<CardOutcome>({
            kind: 'config-error',
            reason: e.message,
          }),
        PushTokenInvalidatedError: (e) =>
          onInvalidated.pipe(
            Effect.catchTag('SqlError', (error) =>
              Effect.logWarning(`[live-activity] LA ${push} cleanup failed`, {
                deviceTokenId,
                error: error.message,
              })
            ),
            Effect.as<CardOutcome>({
              kind: 'token-invalidated',
              reason: e.reason,
            })
          ),
      })
    )
    yield* Match.value(outcome).pipe(
      Match.when({ kind: 'accepted' }, ({ apnsId }) =>
        Effect.logInfo(`[live-activity] LA ${push} accepted by APNs`, {
          deviceTokenId,
          apnsId,
        })
      ),
      Match.when({ kind: 'token-invalidated' }, ({ reason }) =>
        (push === 'start' ? Effect.logWarning : Effect.logInfo)(
          `[live-activity] LA ${push} token invalidated`,
          { deviceTokenId, reason }
        )
      ),
      Match.orElse(({ kind, reason }) =>
        Effect.logWarning(
          `[live-activity] LA ${push} ${kind === 'send-error' ? 'failed' : 'config error'}`,
          { deviceTokenId, error: reason }
        )
      )
    )
    return { push, deviceTokenId, outcome }
  })

const markEnded = (card: ActivityPushToken) =>
  Effect.flatMap(ActivityPushTokenRepository, (repo) =>
    Option.match(Option.fromNullishOr(card.activityId), {
      onNone: () => Effect.void,
      onSome: (id) => Effect.asVoid(repo.markEnded(id)),
    })
  )

// The row ends once APNs takes the End push or calls its token dead. A failed
// End leaves the row active, so the next batch updates the card instead of
// starting one beside it, and the next reconcile sweep sends the End again.
const endCards = (cards: ReadonlyArray<ActivityPushToken>) =>
  Effect.forEach(
    cards,
    (card) =>
      pushCard(
        'end',
        card.deviceTokenId,
        {
          _tag: 'LiveActivityEnd',
          to: card.token,
          dismissalPolicy: 'immediate',
        },
        markEnded(card)
      ).pipe(
        Effect.tap(({ outcome }) =>
          outcome.kind === 'accepted' ? markEnded(card) : Effect.void
        )
      ),
    { concurrency: 'unbounded' }
  )

const updateCards = (
  cards: ReadonlyArray<ActivityPushToken>,
  contentState: LiveActivityContentState
) =>
  Effect.forEach(
    cards,
    (card) =>
      pushCard(
        'update',
        card.deviceTokenId,
        { _tag: 'LiveActivityUpdate', to: card.token, contentState },
        markEnded(card)
      ),
    { concurrency: 'unbounded' }
  )

// APNs rejects an update token exactly when its card left the device, so
// any other failed update still counts as a card on screen.
const stillShowsCard = (update: CardPush) =>
  update.outcome.kind !== 'token-invalidated'

// Push-to-start (iOS 17.2+) on each device that shows no card, once its
// earlier start is confirmed or older than the cooldown. Production iOS
// drops a push-to-start without an alert.
const sendStarts = (
  userId: string,
  activityId: string,
  startTokens: ReadonlyArray<ActivityPushToken>,
  devicesWithCard: ReadonlyArray<string>,
  contentState: LiveActivityContentState,
  start: CardStart
) =>
  Effect.gen(function* () {
    const activityRepo = yield* ActivityPushTokenRepository
    const candidates = Array.filter(
      startTokens,
      (tok) => !Array.contains(devicesWithCard, tok.deviceTokenId)
    )
    if (Array.isReadonlyArrayEmpty(candidates)) {
      if (Array.isReadonlyArrayEmpty(devicesWithCard)) {
        yield* Effect.logInfo(
          '[live-activity] LA start skipped — no start tokens'
        )
      }
      return []
    }

    const cutoff = DateTime.toDateUtc(
      DateTime.subtractDuration(
        DateTime.nowUnsafe(),
        start.bypassCooldown ? Duration.zero : LA_START_COOLDOWN
      )
    )
    const claimed = yield* activityRepo.claimStartTokens(
      userId,
      Array.map(candidates, (tok) => tok.deviceTokenId),
      cutoff,
      activityId
    )
    const startable = Array.filter(candidates, (tok) =>
      Array.contains(claimed, tok.deviceTokenId)
    )
    const unresolved = candidates.length - startable.length
    if (unresolved > 0) {
      yield* Effect.logInfo(
        '[live-activity] LA start skipped — earlier start still unconfirmed',
        { skippedCount: unresolved }
      )
    }
    if (Array.isReadonlyArrayEmpty(startable)) return []

    yield* Effect.logInfo('[live-activity] LA start dispatching', {
      activityId,
      startTokenCount: startable.length,
    })
    const alert = start.alert(contentState)
    return yield* Effect.forEach(
      startable,
      (tok) =>
        pushCard(
          'start',
          tok.deviceTokenId,
          {
            _tag: 'LiveActivityStart',
            to: tok.token,
            attributes: { userId, activityId },
            contentState,
            alert,
          },
          retireStartTokenForDevice(tok.deviceTokenId)
        ),
      { concurrency: 'unbounded' }
    )
  })

// The one rule for every caller: nothing due ends every running card.
const alignCards = <R>(
  userId: string,
  cards: ReadonlyArray<ActivityPushToken>,
  whenDue: (
    contentState: LiveActivityContentState
  ) => Effect.Effect<ReadonlyArray<CardPush>, SqlError, R>
): Effect.Effect<CardSync, SqlError, R | CardDeps> =>
  Effect.gen(function* () {
    const contentState = Option.fromNullishOr(
      yield* buildLiveActivityContentState(userId)
    )
    return yield* Option.match(contentState, {
      onNone: () =>
        Effect.map(endCards(cards), (pushes) => ({ due: false, pushes })),
      onSome: (state) =>
        Effect.map(whenDue(state), (pushes) => ({ due: true, pushes })),
    })
  })

// Brings a user's running cards in line with their backlog without starting
// one: `update` refreshes them, `keep` leaves a card with work alone.
export const syncCards = Effect.fn('LiveActivity.syncCards')(
  function* (userId: string, whenDue: 'keep' | 'update') {
    const activityRepo = yield* ActivityPushTokenRepository
    const cards = yield* activityRepo.findActiveActivitiesByUserId(userId)
    if (Array.isReadonlyArrayEmpty(cards)) return []
    const { pushes } = yield* alignCards(userId, cards, (state) =>
      Match.value(whenDue).pipe(
        Match.when('keep', () => Effect.succeed<ReadonlyArray<CardPush>>([])),
        Match.when('update', () => updateCards(cards, state)),
        Match.exhaustive
      )
    )
    return pushes
  },
  (effect, userId) => Effect.annotateLogs(effect, { userId })
)

// Updates each running card and starts one on every other device.
export const startCards = Effect.fn('LiveActivity.startCards')(
  function* (userId: string, start: CardStart) {
    const activityRepo = yield* ActivityPushTokenRepository
    const activityId = crypto.randomUUID()
    const [cards, startTokens] = yield* Effect.all(
      [
        activityRepo.findActiveActivitiesByUserId(userId),
        activityRepo.findStartTokensByUserId(userId),
      ],
      { concurrency: 'unbounded' }
    )
    const sync = yield* alignCards(userId, cards, (state) =>
      Effect.gen(function* () {
        const updates = yield* updateCards(cards, state)
        const devicesWithCard = pipe(
          Array.filter(updates, stillShowsCard),
          Array.map((update) => update.deviceTokenId)
        )
        const starts = yield* sendStarts(
          userId,
          activityId,
          startTokens,
          devicesWithCard,
          state,
          start
        )
        return [...updates, ...starts]
      })
    )
    return { ...sync, activityId, startTokenCount: startTokens.length }
  },
  (effect, userId) => Effect.annotateLogs(effect, { userId })
)
