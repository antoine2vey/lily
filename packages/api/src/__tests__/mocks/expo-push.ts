import { ExpoPushClient } from '@lily/api/services/push/expo-push-client'
import {
  PendingPushReceipts,
  type PendingReceipt,
} from '@lily/api/services/push/pending-push-receipts'
import { Array, Effect, Layer, Record } from 'effect'
import type {
  ExpoPushMessage,
  ExpoPushReceipt,
  ExpoPushTicket,
} from 'expo-server-sdk'

// Fake Expo API. Each message gets the ticket `ticketFor` returns (ok with a
// fresh id by default); receipts are looked up in `receipts`.
export const createFakeExpoPushClient = (
  options: {
    ticketFor?: (message: ExpoPushMessage) => ExpoPushTicket
    receipts?: Record<string, ExpoPushReceipt>
  } = {}
) => {
  const sent: ExpoPushMessage[] = []
  const receiptRequests: string[][] = []
  const ticketFor =
    options.ticketFor ??
    ((): ExpoPushTicket => ({ status: 'ok', id: crypto.randomUUID() }))
  const layer = Layer.succeed(
    ExpoPushClient,
    ExpoPushClient.of({
      send: (messages) =>
        Effect.sync(() => {
          sent.push(...messages)
          return Array.map(messages, ticketFor)
        }),
      getReceipts: (ticketIds) =>
        Effect.sync(() => {
          receiptRequests.push([...ticketIds])
          return Record.filter(options.receipts ?? {}, (_, id) =>
            Array.contains(ticketIds, id)
          )
        }),
    })
  )
  return { layer, sent, receiptRequests }
}

export const createInMemoryPendingPushReceipts = (
  initial: PendingReceipt[] = []
) => {
  let store: PendingReceipt[] = [...initial]
  const layer = Layer.succeed(
    PendingPushReceipts,
    PendingPushReceipts.of({
      add: (receipts) =>
        Effect.sync(() => {
          store.push(...receipts)
        }),
      sentBefore: (cutoff, limit) =>
        Effect.sync(() =>
          store
            .filter(
              (r) => r.sentAt.epochMilliseconds <= cutoff.epochMilliseconds
            )
            .slice(0, limit)
        ),
      remove: (receipts) =>
        Effect.sync(() => {
          store = store.filter(
            (r) => !receipts.some((x) => x.ticketId === r.ticketId)
          )
        }),
    })
  )
  return { layer, current: () => store }
}
