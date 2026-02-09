import {
  type IPushService,
  PushConfigError,
  type PushMessage,
  PushSendError,
  PushService,
  type PushTicket,
} from '@lily/shared/server'
import { Array, Effect, Layer, Option, pipe } from 'effect'
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
const convertTicket = (ticket: ExpoPushTicket): PushTicket => {
  if (ticket.status === 'error') {
    return {
      id: crypto.randomUUID(),
      status: 'error',
      message: ticket.message,
    }
  }
  return {
    id: ticket.id,
    status: 'ok',
  }
}

// Expo Push implementation of IPushService
export const ExpoPushServiceLive = Layer.effect(
  PushService,
  Effect.gen(function* () {
    const expo = new Expo()

    const service: IPushService = {
      send: (message) =>
        Effect.gen(function* () {
          yield* Effect.annotateCurrentSpan('push.token', message.to)
          // Validate token format
          if (!Expo.isExpoPushToken(message.to)) {
            return yield* Effect.fail(
              new PushConfigError({
                message: `Invalid Expo push token: ${message.to}`,
              })
            )
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

          const ticket = result[0]

          if (!ticket) {
            return yield* Effect.fail(
              new PushSendError({
                message: 'No ticket received from Expo',
              })
            )
          }

          if (ticket.status === 'error') {
            return yield* Effect.fail(
              new PushSendError({
                message: pipe(
                  Option.fromNullable(ticket.message),
                  Option.getOrElse(() => 'Unknown push error')
                ),
                cause: ticket.details,
              })
            )
          }

          return {
            id: ticket.id,
            status: 'ok' as const,
          } satisfies PushTicket
        }).pipe(Effect.withSpan('ExpoPush.send')),

      sendBatch: (messages) =>
        Effect.gen(function* () {
          yield* Effect.annotateCurrentSpan('push.count', messages.length)
          // Validate all tokens
          const invalidTokens = Array.filter(
            messages,
            (m) => !Expo.isExpoPushToken(m.to)
          )
          if (invalidTokens.length > 0) {
            return yield* Effect.fail(
              new PushConfigError({
                message: `Invalid Expo push tokens: ${Array.map(invalidTokens, (t) => t.to).join(', ')}`,
              })
            )
          }

          // Chunk messages (Expo recommends max 100 per batch)
          const chunks = expo.chunkPushNotifications(
            Array.map(messages, buildExpoMessage)
          )

          const tickets: PushTicket[] = []

          for (const chunk of chunks) {
            const result = yield* Effect.tryPromise({
              try: () => expo.sendPushNotificationsAsync(chunk),
              catch: (error) =>
                new PushSendError({
                  message: 'Failed to send push notification batch',
                  cause: error,
                }),
            })

            for (const ticket of result) {
              tickets.push(convertTicket(ticket))
            }
          }

          return tickets
        }).pipe(Effect.withSpan('ExpoPush.sendBatch')),
    }

    yield* Effect.log('Expo Push service initialized')

    return service
  })
)
