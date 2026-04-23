import { Alerter, withProviderAlert } from '@lily/api/services/alerting'
import {
  type IPushService,
  type LiveActivityContentState,
  type LiveActivityPushMessage,
  PushConfigError,
  type PushMessage,
  PushSendError,
  PushService,
  type PushTicket,
} from '@lily/shared/server'
import { Array, Effect, Layer, Match, Option, pipe } from 'effect'
import Expo, {
  type ExpoPushMessage,
  type ExpoPushTicket,
} from 'expo-server-sdk'

// Expo's SDK types don't model Live Activity keys yet. The push service still
// accepts them as extra top-level fields (`contentState`, `attributes`,
// `attributesType`, `event`, `dismissalDate`) and forwards them to APNs. We
// widen the ExpoPushMessage type for just this code path.
type LiveActivityExpoMessage = ExpoPushMessage & {
  attributes?: Record<string, unknown>
  attributesType?: string
  contentState?: Record<string, unknown>
  event?: 'start' | 'update' | 'end'
  dismissalDate?: number
  stale?: number
}

const ATTRIBUTES_TYPE = 'CareTasksAttributes'

// Helper to build Expo push message
export const buildExpoMessage = (message: PushMessage): ExpoPushMessage => {
  const expoMessage: ExpoPushMessage = {
    to: message.to,
    title: message.title,
    body: message.body,
  }
  if (message.data) {
    expoMessage.data = message.data as Record<string, unknown>
  }
  if (message.sound) {
    expoMessage.sound = message.sound
  }
  if (message.badge !== undefined) {
    expoMessage.badge = message.badge
  }
  if (message.interruptionLevel) {
    expoMessage.interruptionLevel = message.interruptionLevel
  }
  return expoMessage
}

// Serialize ContentState for the wire. `updatedAt` is a Date → send as epoch
// seconds (Apple's expected format for `timestamp` in ActivityKit payloads).
const encodeContentState = (
  state: LiveActivityContentState
): Record<string, unknown> => ({
  schemaVersion: state.schemaVersion,
  totalPlants: state.totalPlants,
  groups: state.groups,
  headline: state.headline,
  subheadline: state.subheadline,
  title: state.title,
  completedToday: state.completedToday,
  updatedAt: Math.floor(state.updatedAt.getTime() / 1000),
})

const buildLiveActivityMessage = (
  message: LiveActivityPushMessage
): LiveActivityExpoMessage =>
  Match.value(message).pipe(
    Match.tag('LiveActivityStart', (m): LiveActivityExpoMessage => {
      const base: LiveActivityExpoMessage = {
        to: m.to,
        title: m.alert?.title ?? '',
        body: m.alert?.body ?? '',
        attributes: { ...m.attributes },
        attributesType: ATTRIBUTES_TYPE,
        contentState: encodeContentState(m.contentState),
        event: 'start',
      }
      if (m.alert?.sound) base.sound = m.alert.sound
      return base
    }),
    Match.tag(
      'LiveActivityUpdate',
      (m): LiveActivityExpoMessage => ({
        to: m.to,
        title: m.alert?.title ?? '',
        body: m.alert?.body ?? '',
        contentState: encodeContentState(m.contentState),
        event: 'update',
        ...(m.alert?.sound ? { sound: m.alert.sound } : {}),
      })
    ),
    Match.tag('LiveActivityEnd', (m): LiveActivityExpoMessage => {
      const base: LiveActivityExpoMessage = {
        to: m.to,
        title: '',
        body: '',
        event: 'end',
        dismissalDate: Math.floor(Date.now() / 1000),
      }
      if (m.contentState) {
        base.contentState = encodeContentState(m.contentState)
      }
      return base
    }),
    Match.exhaustive
  )

// Helper to convert Expo ticket to our PushTicket
const convertTicket = (ticket: ExpoPushTicket): PushTicket =>
  pipe(
    Match.value(ticket),
    Match.when({ status: 'error' }, (t) => ({
      id: crypto.randomUUID(),
      status: 'error' as const,
      message: t.message,
    })),
    Match.when({ status: 'ok' }, (t) => ({
      id: t.id,
      status: 'ok' as const,
    })),
    Match.exhaustive
  )

// Expo Push implementation of IPushService
export const ExpoPushServiceLive = Layer.effect(
  PushService,
  Effect.gen(function* () {
    const expo = new Expo()
    const alerter = yield* Alerter
    const alert = withProviderAlert(alerter, { provider: 'expo-push' })

    const service: IPushService = {
      send: Effect.fn('ExpoPush.send')(function* (message: PushMessage) {
        yield* Effect.annotateCurrentSpan('push.token', message.to)
        // Validate token format
        if (!Expo.isExpoPushToken(message.to)) {
          return yield* new PushConfigError({
            message: `Invalid Expo push token: ${message.to}`,
          })
        }

        const result = yield* Effect.tryPromise({
          try: () =>
            expo.sendPushNotificationsAsync([buildExpoMessage(message)]),
          catch: (error) =>
            new PushSendError({
              message: 'Failed to send push notification',
              cause: error,
            }),
        })

        const ticket = yield* pipe(
          Array.head(result),
          Option.match({
            onNone: () =>
              Effect.fail(
                new PushSendError({ message: 'No ticket received from Expo' })
              ),
            onSome: Effect.succeed,
          })
        )

        if (ticket.status === 'error') {
          return yield* new PushSendError({
            message: pipe(
              Option.fromNullable(ticket.message),
              Option.getOrElse(() => 'Unknown push error')
            ),
            cause: ticket.details,
          })
        }

        return {
          id: ticket.id,
          status: 'ok' as const,
        } satisfies PushTicket
      }, alert),

      sendBatch: Effect.fn('ExpoPush.sendBatch')(function* (
        messages: readonly PushMessage[]
      ) {
        yield* Effect.annotateCurrentSpan('push.count', Array.length(messages))
        // Validate all tokens
        const invalidTokens = Array.filter(
          messages,
          (m) => !Expo.isExpoPushToken(m.to)
        )
        if (Array.isNonEmptyArray(invalidTokens)) {
          return yield* new PushConfigError({
            message: `Invalid Expo push tokens: ${Array.join(
              Array.map(invalidTokens, (t) => t.to),
              ', '
            )}`,
          })
        }

        // Chunk messages (Expo recommends max 100 per batch)
        const chunks = expo.chunkPushNotifications(
          Array.map(messages, buildExpoMessage)
        )

        const ticketBatches = yield* Effect.forEach(chunks, (chunk) =>
          Effect.map(
            Effect.tryPromise({
              try: () => expo.sendPushNotificationsAsync(chunk),
              catch: (error) =>
                new PushSendError({
                  message: 'Failed to send push notification batch',
                  cause: error,
                }),
            }),
            (result) => Array.map(result, convertTicket)
          )
        )

        return Array.flatten(ticketBatches)
      }, alert),

      sendLiveActivity: Effect.fn('ExpoPush.sendLiveActivity')(function* (
        message: LiveActivityPushMessage
      ) {
        yield* Effect.annotateCurrentSpan('push.token', message.to)
        yield* Effect.annotateCurrentSpan('liveActivity.event', message._tag)

        const expoMessage = buildLiveActivityMessage(message)
        // The Expo push endpoint accepts the extra LA keys; the SDK types
        // don't model them so we cast to ExpoPushMessage for the call.
        const result = yield* Effect.tryPromise({
          try: () =>
            expo.sendPushNotificationsAsync([expoMessage as ExpoPushMessage]),
          catch: (error) =>
            new PushSendError({
              message: 'Failed to send Live Activity push',
              cause: error,
            }),
        })

        const ticket = yield* pipe(
          Array.head(result),
          Option.match({
            onNone: () =>
              Effect.fail(
                new PushSendError({
                  message: 'No ticket received from Expo (live activity)',
                })
              ),
            onSome: Effect.succeed,
          })
        )

        if (ticket.status === 'error') {
          return yield* new PushSendError({
            message: pipe(
              Option.fromNullable(ticket.message),
              Option.getOrElse(() => 'Unknown live activity push error')
            ),
            cause: ticket.details,
          })
        }

        return {
          id: ticket.id,
          status: 'ok' as const,
        } satisfies PushTicket
      }, alert),
    }

    yield* Effect.log('Expo Push service initialized')

    return service
  })
)
