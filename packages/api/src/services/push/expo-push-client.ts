import { PushSendError } from '@lily/shared/server'
import { Array, Context, Duration, Effect, Layer } from 'effect'
import Expo, {
  type ExpoPushMessage,
  type ExpoPushReceipt,
  type ExpoPushTicket,
} from 'expo-server-sdk'

// ExpoPlusApns.sendBatch, one send request plus token bookkeeping, ran p99
// 0.63 s and at most 2.8 s over the 30 days to 2026-10-19. The SDK retries a
// 429 twice with 1 s then 2 s of backoff inside one call, so a healthy call
// can take a few seconds. A request with no answer after 15 s is dead.
const EXPO_REQUEST_TIMEOUT = Duration.seconds(15)

// The SDK takes no AbortSignal, and under Bun its node-fetch is Bun's fetch,
// which ignores the `httpAgent` option, so nothing here can close the socket.
// On timeout the fiber stops waiting and the request finishes or fails on its
// own. A send may still have reached Expo, so a retry can deliver it twice.
const request = <A>(message: string, call: () => Promise<A>) =>
  Effect.tryPromise({
    try: call,
    catch: (cause) => new PushSendError({ message, cause }),
  }).pipe(
    Effect.timeoutOrElse({
      duration: EXPO_REQUEST_TIMEOUT,
      orElse: () =>
        Effect.fail(
          new PushSendError({
            message: `${message}: no response within ${Duration.format(EXPO_REQUEST_TIMEOUT)}`,
          })
        ),
    })
  )

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
          request('Failed to send push notification batch', () =>
            expo.sendPushNotificationsAsync(chunk)
          )
        ).pipe(Effect.map(Array.flatten)),

      getReceipts: (ticketIds) =>
        Effect.forEach(
          expo.chunkPushNotificationReceiptIds([...ticketIds]),
          (chunk) =>
            request('Failed to fetch push receipts', () =>
              expo.getPushNotificationReceiptsAsync(chunk)
            )
        ).pipe(
          Effect.map((pages) =>
            Array.reduce(pages, {}, (all, page) => ({ ...all, ...page }))
          )
        ),
    })
  })
}
