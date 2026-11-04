import { Alerter } from '@lily/api/services/alerting'
import { createScheduler } from '@lily/api/services/helpers/create-scheduler'
import {
  ExpoPushClient,
  isDeviceNotRegistered,
} from '@lily/api/services/push/expo-push-client'
import { PendingPushReceipts } from '@lily/api/services/push/pending-push-receipts'
import { retireExpoTokens } from '@lily/api/services/push/retire-expo-tokens'
import {
  Array,
  DateTime,
  Duration,
  Effect,
  HashSet,
  Option,
  Record,
} from 'effect'
import type { ExpoPushErrorReceipt } from 'expo-server-sdk'

// Expo asks callers to wait before reading receipts and keeps them about a
// day. A ticket still unanswered after RECEIPT_TTL never will be.
const RECEIPT_DELAY = Duration.minutes(15)
const RECEIPT_TTL = Duration.hours(24)
const MAX_TICKETS_PER_RUN = 3000

const APP_FAULT_CODES = HashSet.make('InvalidCredentials', 'MessageTooBig')
const APP_FAULT_ALERT_WINDOW = Duration.hours(1)

const codeOf = (receipt: ExpoPushErrorReceipt) =>
  Option.getOrElse(
    Option.fromNullishOr(receipt.details?.error),
    () => 'Unknown'
  )

const reportErrorReceipts = Effect.fn('push-receipts.reportErrorReceipts')(
  function* (errors: ReadonlyArray<ExpoPushErrorReceipt>) {
    const alerter = yield* Alerter
    const byCode = Array.groupBy(errors, codeOf)
    yield* Effect.forEach(
      Record.toEntries(byCode),
      ([code, receipts]) =>
        Effect.gen(function* () {
          const count = Array.length(receipts)
          const message = Array.headNonEmpty(receipts).message
          yield* Effect.logWarning('Expo push receipt error', {
            code,
            count,
            message,
          })
          if (HashSet.has(APP_FAULT_CODES, code)) {
            yield* alerter.alert({
              _tag: 'ProviderError',
              provider: 'expo-push',
              errorTag: code,
              message: `${count} push ${count === 1 ? 'receipt' : 'receipts'} failed with ${code}: ${message}`,
              dedupeWindow: APP_FAULT_ALERT_WINDOW,
            })
          }
        }),
      { discard: true }
    )
    return Record.map(byCode, Array.length)
  }
)

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

  const errorsByCode = yield* reportErrorReceipts(
    Array.filter(
      Array.getSomes(Array.map(due, (r) => receiptOf(r.ticketId))),
      (receipt): receipt is ExpoPushErrorReceipt => receipt.status === 'error'
    )
  )

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
    errorsByCode,
  })
}).pipe(Effect.withSpan('push-receipts.checkPushReceipts'))

export const startPushReceiptScheduler = createScheduler({
  name: 'push-receipts',
  interval: '15 minutes',
  runOnStartup: false,
  task: checkPushReceipts,
})
