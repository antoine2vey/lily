import { createScheduler } from '@lily/api/services/helpers/create-scheduler'
import {
  ExpoPushClient,
  isDeviceNotRegistered,
} from '@lily/api/services/push/expo-push-client'
import { PendingPushReceipts } from '@lily/api/services/push/pending-push-receipts'
import { retireExpoTokens } from '@lily/api/services/push/retire-expo-tokens'
import { Array, DateTime, Duration, Effect, Option, Record } from 'effect'

// Expo asks callers to wait before reading receipts and keeps them about a
// day. A ticket still unanswered after RECEIPT_TTL never will be.
const RECEIPT_DELAY = Duration.minutes(15)
const RECEIPT_TTL = Duration.hours(24)
const MAX_TICKETS_PER_RUN = 3000

export const checkPushReceipts = Effect.gen(function* () {
  const pending = yield* PendingPushReceipts
  const expo = yield* ExpoPushClient
  const now = yield* DateTime.now

  const due = yield* pending.sentBefore(
    DateTime.subtractDuration(now, RECEIPT_DELAY),
    MAX_TICKETS_PER_RUN
  )
  if (Array.isReadonlyArrayEmpty(due)) return

  const receipts = yield* expo.getReceipts(Array.map(due, (r) => r.ticketId))
  const receiptOf = (ticketId: string) => Record.get(receipts, ticketId)
  const expiredBefore = DateTime.subtractDuration(now, RECEIPT_TTL)

  const unregistered = Array.filter(due, (r) =>
    Option.exists(receiptOf(r.ticketId), isDeviceNotRegistered)
  )
  yield* retireExpoTokens(unregistered, 'DeviceNotRegistered')

  const settled = Array.filter(
    due,
    (r) =>
      Option.isSome(receiptOf(r.ticketId)) ||
      DateTime.isLessThan(r.sentAt, expiredBefore)
  )
  yield* pending.remove(settled)

  yield* Effect.log('Checked Expo push receipts', {
    checked: Array.length(due),
    settled: Array.length(settled),
    unregistered: Array.length(unregistered),
  })
}).pipe(Effect.withSpan('push-receipts.checkPushReceipts'))

export const startPushReceiptScheduler = createScheduler({
  name: 'push-receipts',
  interval: '15 minutes',
  runOnStartup: false,
  task: checkPushReceipts,
})
