import {
  type IPushService,
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

// Helper to build Expo push message
const buildExpoMessage = (message: PushMessage): ExpoPushMessage => {
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
  return expoMessage
}

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
      }),

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
      }),
    }

    yield* Effect.log('Expo Push service initialized')

    return service
  })
)
