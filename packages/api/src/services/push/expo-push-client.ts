import { PushSendError } from '@lily/shared/server'
import { Array, Context, Effect, Layer } from 'effect'
import Expo, {
  type ExpoPushMessage,
  type ExpoPushReceipt,
  type ExpoPushTicket,
} from 'expo-server-sdk'

// Expo's verdict that the app behind a token is gone (uninstalled, or the OS
// revoked the registration). Sending to it again can never deliver.
export const isDeviceNotRegistered = (
  outcome: ExpoPushTicket | ExpoPushReceipt
): boolean =>
  outcome.status === 'error' && outcome.details?.error === 'DeviceNotRegistered'

// The Expo push HTTP API, chunked to its per-request limits. `send` returns
// one ticket per message, in message order.
export class ExpoPushClient extends Context.Service<
  ExpoPushClient,
  {
    readonly send: (
      messages: ReadonlyArray<ExpoPushMessage>
    ) => Effect.Effect<ReadonlyArray<ExpoPushTicket>, PushSendError>
    readonly getReceipts: (
      ticketIds: ReadonlyArray<string>
    ) => Effect.Effect<Readonly<Record<string, ExpoPushReceipt>>, PushSendError>
  }
>()('ExpoPushClient') {
  static readonly layer = Layer.sync(ExpoPushClient, () => {
    const expo = new Expo()
    return ExpoPushClient.of({
      send: (messages) =>
        Effect.forEach(expo.chunkPushNotifications([...messages]), (chunk) =>
          Effect.tryPromise({
            try: () => expo.sendPushNotificationsAsync(chunk),
            catch: (error) =>
              new PushSendError({
                message: 'Failed to send push notification batch',
                cause: error,
              }),
          })
        ).pipe(Effect.map(Array.flatten)),

      getReceipts: (ticketIds) =>
        Effect.forEach(
          expo.chunkPushNotificationReceiptIds([...ticketIds]),
          (chunk) =>
            Effect.tryPromise({
              try: () => expo.getPushNotificationReceiptsAsync(chunk),
              catch: (error) =>
                new PushSendError({
                  message: 'Failed to fetch push receipts',
                  cause: error,
                }),
            })
        ).pipe(
          Effect.map((pages) =>
            Array.reduce(pages, {}, (all, page) => ({ ...all, ...page }))
          )
        ),
    })
  })
}
