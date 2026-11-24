import {
  type CreateDeadLetterData,
  DeadLetterRepository,
} from '@lily/api/repositories/dead-letter.repository'
import { DeviceTokenRepository } from '@lily/api/repositories/device-token.repository'
import type { NotificationRow } from '@lily/api/repositories/helpers/notification-row'
import {
  type DeferredNotification,
  type FailedAttempt,
  NotificationDelivery,
} from '@lily/api/repositories/notification-delivery.repository'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { Alerter, logAndAlertWarning } from '@lily/api/services/alerting'
import {
  createScheduler,
  drainOnInterrupt,
} from '@lily/api/services/helpers/create-scheduler'
import { startCards } from '@lily/api/services/live-activity/cards'
import { MessageQueue } from '@lily/api/services/message-queue/service'
import {
  MAX_NOTIFICATION_IDS,
  NotificationId,
  PostgresText,
  type QueueMessage,
  type QueueMessageDecodeError,
  RetryCount,
  toPostgresText,
} from '@lily/api/services/message-queue/types'
import {
  DEFER_MESSAGE,
  Decision,
  DROP_MESSAGE,
  decide,
  loadPlantFacts,
  loadRecipients,
} from '@lily/api/services/notification-scheduler/dispatch-gate'
import {
  type Rendered,
  recipientLanguage,
  renderDelivery,
} from '@lily/api/services/notification-scheduler/render-delivery'
import { PushService } from '@lily/api/services/push/service'
import {
  type InterruptionLevel,
  type PushConfigError,
  PushSendError,
  type PushTicket,
} from '@lily/api/services/push/types'
import { type NotificationTopic, TOPIC_CATEGORY } from '@lily/shared'
import {
  Array,
  Cause,
  Config,
  DateTime,
  Duration,
  Effect,
  Filter,
  Option,
  Order,
  Predicate,
  pipe,
  Record,
  Schedule,
  Schema,
  Scope,
  String as Str,
} from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

export const VISIBILITY_TIMEOUT = Duration.minutes(10)
export const CLAIM_REFRESH_INTERVAL = Duration.minutes(1)
const DELIVERY_TIMEOUT = Duration.hours(1)

// Care reminders are the "do it today or it slips" cluster — we want them to
// pierce Focus/DND on iOS 15+ so the plant actually gets cared for. Everything
// else (social pings, engagement nudges) stays at the default 'active' level.
const resolveInterruptionLevel = (
  topic: NotificationTopic
): InterruptionLevel | undefined =>
  TOPIC_CATEGORY[topic] === 'care' ? 'time-sensitive' : undefined

export const workerRetryPolicy = Schedule.max([
  Schedule.exponential('1 second'),
  Schedule.recurs(3),
])

const completeDelivery = (
  message: QueueMessage,
  rendered: Rendered,
  results: ReadonlyArray<{ status: 'ok' | 'error' }>,
  deviceCount: number
) =>
  Effect.gen(function* () {
    const notificationRepo = yield* NotificationDelivery
    const alerter = yield* Alerter

    const failures = Array.filter(results, (r) => r.status === 'error')
    if (failures.length > 0) {
      yield* logAndAlertWarning(
        alerter,
        'notification-worker',
        'Some push notifications failed',
        { total: results.length, failed: failures.length }
      )
    }

    yield* notificationRepo
      .markManyAsSent(rendered.sent)
      .pipe(Effect.retry(workerRetryPolicy))

    // The scheduler merges a user's due care reminders into one message, so
    // this runs once per user per batch. Updates are silent, as the regular
    // push already showed the banner. A start reuses that banner's title and
    // body as its alert, so a user on the start path sees it twice; making
    // that one banner is a separate UX change.
    if (TOPIC_CATEGORY[message.topic] === 'care') {
      const alert = { ...rendered.push, sound: 'default' as const }
      yield* startCards(message.payload.userId, {
        alert: () => alert,
        bypassCooldown: false,
      }).pipe(Effect.retry(workerRetryPolicy))
    }

    yield* Effect.log('Push notification sent', {
      notificationIds: Array.map(rendered.sent, (row) => row.id),
      devices: deviceCount,
    })
  }).pipe(
    Effect.catchTag('SqlError', (error) =>
      Effect.gen(function* () {
        const alerter = yield* Alerter
        yield* logAndAlertWarning(
          alerter,
          'notification-worker',
          'Push sent but delivery bookkeeping failed',
          {
            messageId: message.id,
            notificationIds: Array.map(rendered.sent, (row) => row.id),
            error: String(error),
          }
        )
      })
    )
  ) satisfies Effect.Effect<void, never, unknown>

type ErrorTicket = Extract<PushTicket, { readonly status: 'error' }>

const isErrorTicket = (ticket: PushTicket): ticket is ErrorTicket =>
  ticket.status === 'error'

const ticketErrors = (tickets: ReadonlyArray<ErrorTicket>) =>
  pipe(
    Array.groupBy(tickets, (ticket): string => ticket.code),
    Record.toEntries,
    Array.map(([code, group]) => `${code} (${Array.length(group)})`),
    Array.join('; ')
  )

const gateClaimedRows = (
  message: QueueMessage,
  claimedIds: ReadonlyArray<string>
) =>
  Effect.gen(function* () {
    const notificationRepo = yield* NotificationDelivery
    const plantRepo = yield* PlantRepository
    const userRepo = yield* UserRepository
    const rows = yield* notificationRepo.findByIds(claimedIds)
    const plants = yield* plantRepo.findByIds(
      pipe(
        Array.filterMap(
          rows,
          Filter.fromPredicateOption((row) => Option.fromNullishOr(row.plantId))
        ),
        Array.dedupe
      )
    )
    const now = DateTime.toDateUtc(yield* DateTime.now)
    const users = yield* userRepo.findByIds(
      Array.dedupe(Array.map(rows, (row) => row.userId))
    )
    const [recipients, plantFacts] = yield* Effect.all([
      loadRecipients(users, now),
      loadPlantFacts(plants),
    ])
    const decided = Array.map(rows, (row) => ({
      row,
      decision: decide(
        row,
        Option.fromNullishOr(recipients.get(row.userId)),
        plantFacts,
        now
      ),
    }))

    const dropIds: string[] = []
    const deferred: DeferredNotification[] = []
    const sendRows: NotificationRow[] = []
    yield* Effect.forEach(decided, ({ row, decision }) => {
      const logged = { id: row.id, userId: row.userId, messageId: message.id }
      return Decision.$match(decision, {
        Send: () => Effect.sync(() => sendRows.push(row)),
        Drop: ({ reason }) => {
          dropIds.push(row.id)
          return Effect.log(DROP_MESSAGE[reason], logged)
        },
        Defer: ({ reason, until }) => {
          deferred.push({ id: row.id, until })
          return Effect.log(DEFER_MESSAGE[reason], { ...logged, until })
        },
      })
    })
    yield* notificationRepo.deleteByIds(dropIds)
    yield* notificationRepo.deferUntil(deferred, Option.some(message.id))

    return {
      sendRows,
      plants,
      language: recipientLanguage(users, message.payload.userId),
    }
  })

export const processMessage = Effect.fn('notification-worker.process')(
  function* (message: QueueMessage) {
    const { notificationIds } = message.payload
    yield* Effect.annotateCurrentSpan('notification.ids', notificationIds)
    yield* Effect.annotateCurrentSpan('userId', message.payload.userId)
    const pushService = yield* PushService
    const deviceTokenRepo = yield* DeviceTokenRepository
    const notificationRepo = yield* NotificationDelivery

    const claimedIds = yield* notificationRepo.claimForDelivery(
      notificationIds,
      message.id
    )
    if (Array.isReadonlyArrayEmpty(claimedIds)) {
      yield* Effect.log(
        'Skipping message - rows already delivered or claimed',
        {
          messageId: message.id,
          notificationIds,
        }
      )
      return
    }

    const gated = yield* gateClaimedRows(message, claimedIds)
    if (Array.isReadonlyArrayEmpty(gated.sendRows)) {
      yield* Effect.log('Skipping message - the gate kept no row', {
        messageId: message.id,
        notificationIds: claimedIds,
      })
      return
    }
    const sendRows = Array.sort(
      gated.sendRows,
      Order.mapInput(Order.Number, (row: NotificationRow) =>
        notificationIds.indexOf(row.id)
      )
    )
    const { unrenderedIds, rendered } = renderDelivery(
      message.topic,
      sendRows,
      gated.plants,
      gated.language
    )
    yield* Effect.forEach(unrenderedIds, (notificationId) =>
      Effect.logWarning('Sending stored text - params did not render', {
        notificationId,
        messageId: message.id,
      })
    )
    if (Option.isNone(rendered)) {
      yield* Effect.log('Dropping push - no row left to render', {
        messageId: message.id,
        notificationIds: Array.map(sendRows, (row) => row.id),
      })
      yield* notificationRepo.deleteByIds(Array.map(sendRows, (row) => row.id))
      return
    }
    const delivery = rendered.value
    const sendIds = Array.map(delivery.sent, (row) => row.id)
    const plantIds =
      sendIds.length === Array.dedupe(notificationIds).length
        ? message.payload.plantIds
        : pipe(
            Array.filterMap(
              sendRows,
              Filter.fromPredicateOption((row) =>
                Array.contains(sendIds, row.id)
                  ? Option.fromNullishOr(row.plantId)
                  : Option.none()
              )
            ),
            Array.dedupe
          )

    const tokens = yield* deviceTokenRepo.findByUserId(message.payload.userId)
    const activeTokens = Array.filter(tokens, (t) => t.isActive)

    if (activeTokens.length === 0) {
      yield* Effect.logWarning('No active device tokens for user', {
        userId: message.payload.userId,
        notificationIds: sendIds,
      })
      // Still mark as sent since there's no device to send to
      yield* notificationRepo.markManyAsSent(delivery.sent)
      return
    }

    const data: Record<string, unknown> = Record.filter(
      {
        topic: message.topic,
        ...delivery.push,
        plantIds: Array.match(plantIds, {
          onEmpty: () => undefined,
          onNonEmpty: (ids) => Array.join(ids, ','),
        }),
        ...Record.map(message.payload.metadata ?? {}, (v) => v),
      } as Record<string, unknown>,
      (v) => v !== undefined
    )

    const interruptionLevel = resolveInterruptionLevel(message.topic)

    const pushMessages = Array.map(activeTokens, (token) => ({
      to: token.token,
      ...delivery.push,
      sound: 'default' as const,
      data,
      ...(interruptionLevel ? { interruptionLevel } : {}),
    }))

    const results = yield* pushService.sendBatch(pushMessages)
    if (
      Array.isReadonlyArrayNonEmpty(results) &&
      Array.every(results, isErrorTicket)
    ) {
      return yield* new PushSendError({
        message: `Every push ticket failed: ${ticketErrors(results)}`,
      })
    }

    yield* completeDelivery(message, delivery, results, activeTokens.length)
  }
)

const RETRY_DELAYS = [Duration.minutes(1), Duration.minutes(5)] as const

const deadLetterFor = (
  message: QueueMessage,
  failed: Array.NonEmptyReadonlyArray<FailedAttempt>,
  error: string
): CreateDeadLetterData => {
  const firstPlantId = Array.head(message.payload.plantIds)
  return {
    originalMessageId: message.id,
    topic: message.topic,
    payload: message.payload,
    error,
    retryCount: Array.max(
      Array.map(failed, (row) => row.retryCount),
      Order.Number
    ),
    userId: message.payload.userId,
    ...(Option.isSome(firstPlantId) ? { plantId: firstPlantId.value } : {}),
  }
}

const readSqlState = Schema.decodeUnknownOption(
  Schema.Struct({ code: Schema.String })
)

const retryLater = Effect.fn('notification-worker.retryLater')(function* (
  message: QueueMessage,
  cause: SqlError | PushSendError | PushConfigError
) {
  const notificationRepo = yield* NotificationDelivery
  const deadLetterRepo = yield* DeadLetterRepository
  const alerter = yield* Alerter
  const sql = yield* SqlClient.SqlClient
  const now = yield* DateTime.now
  const error = String(cause)
  const recorded = sql.withTransaction(
    Effect.gen(function* () {
      const written = yield* notificationRepo.retryLater(
        message.payload.notificationIds,
        message.id,
        Array.map(RETRY_DELAYS, (delay) =>
          DateTime.toDateUtc(DateTime.addDuration(now, delay))
        ),
        error
      )
      const failed = Array.filter(written, (row) => row.status === 'failed')
      if (Array.isReadonlyArrayNonEmpty(failed)) {
        yield* deadLetterRepo.create(deadLetterFor(message, failed, error))
      }
      return written
    })
  )
  const attempts = yield* Effect.tapErrorTag(recorded, 'SqlError', (sqlError) =>
    alerter.alertWarning(
      'notification-worker',
      'Failed push could not be recorded',
      {
        messageId: message.id,
        topic: message.topic,
        notificationIds: message.payload.notificationIds,
        reason: sqlError.reason._tag,
        sqlState: Option.getOrNull(
          Option.map(readSqlState(sqlError.reason.cause), ({ code }) => code)
        ),
      }
    )
  )
  const retried = Array.filter(attempts, (row) => row.status === 'pending')
  if (Array.isReadonlyArrayNonEmpty(retried)) {
    yield* Effect.logWarning('Retrying notification', {
      messageId: message.id,
      notificationIds: Array.map(retried, (row) => row.id),
      retryCount: Array.map(retried, (row) => row.retryCount),
      error,
    })
  }
  const failed = Array.filter(attempts, (row) => row.status === 'failed')
  if (Array.isReadonlyArrayNonEmpty(failed)) {
    const notificationIds = Array.map(failed, (row) => row.id)
    yield* Effect.logError('Message moved to dead letter queue', {
      messageId: message.id,
      notificationIds,
      error,
    })
    yield* alerter.alertWarning(
      'notification-worker',
      'Message moved to dead letter queue',
      { messageId: message.id, topic: message.topic, notificationIds, error }
    )
  }
})

const readEntry = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Unknown)
)
const readId = Schema.decodeUnknownOption(Schema.Struct({ id: PostgresText }))
const readForeignId = Schema.decodeUnknownOption(
  Schema.Struct({ messageId: PostgresText })
)
const readRetryCount = Schema.decodeUnknownOption(
  Schema.Struct({ retryCount: RetryCount })
)
const readTopic = Schema.decodeUnknownOption(
  Schema.Struct({ topic: PostgresText })
)
const readNotificationIds = Schema.decodeUnknownOption(
  Schema.Struct({
    payload: Schema.Struct({ notificationIds: Schema.Array(Schema.Unknown) }),
  })
)
const isNotificationId = Schema.is(NotificationId)

interface PoisonIds {
  readonly messageId: Option.Option<string>
  readonly notificationIds: ReadonlyArray<string>
  readonly malformedIds: ReadonlyArray<unknown>
  readonly retryCount: number
}

const readPoisonIds = (entry: Option.Option<unknown>): PoisonIds => {
  const ids = pipe(
    Option.flatMap(entry, readNotificationIds),
    Option.map((m) => m.payload.notificationIds),
    Option.getOrElse((): ReadonlyArray<unknown> => [])
  )
  return {
    messageId: Option.flatMap(entry, (e) =>
      pipe(
        readId(e),
        Option.map((m) => m.id),
        Option.orElse(() => Option.map(readForeignId(e), (m) => m.messageId))
      )
    ),
    notificationIds: Array.filter(ids, isNotificationId),
    malformedIds: Array.filter(ids, Predicate.not(isNotificationId)),
    retryCount: pipe(
      Option.flatMap(entry, readRetryCount),
      Option.map((m) => m.retryCount),
      Option.getOrElse(() => 0)
    ),
  }
}

const discardPoisonMessage = (
  topic: string,
  ids: PoisonIds,
  payload: object | string,
  rawData: string,
  rawError: string
) =>
  Effect.gen(function* () {
    const error = toPostgresText(rawError)
    const alerter = yield* Alerter
    const deadLetterRepo = yield* DeadLetterRepository
    const notificationRepo = yield* NotificationDelivery

    const headline = pipe(error, Str.split('\n'), Array.headNonEmpty)

    yield* Effect.logError('[notification-worker] discarding message', {
      topic,
      messageId: Option.getOrUndefined(ids.messageId),
      retryCount: ids.retryCount,
      error,
    })

    const claimedIds = yield* Option.match(ids.messageId, {
      onNone: () => Effect.succeed<ReadonlyArray<string>>([]),
      onSome: (id) =>
        Effect.map(
          Effect.forEach(
            Array.chunksOf(ids.notificationIds, MAX_NOTIFICATION_IDS),
            (chunk) => notificationRepo.claimForDelivery(chunk, id)
          ),
          Array.flatten
        ),
    })
    const deadLetter = {
      originalMessageId: Option.getOrElse(ids.messageId, () => 'unknown'),
      topic,
      error,
      retryCount: ids.retryCount,
    }
    yield* deadLetterRepo.create({ ...deadLetter, payload }).pipe(
      Effect.catchTag('SqlError', () =>
        deadLetterRepo.create({
          ...deadLetter,
          payload: toPostgresText(rawData),
        })
      )
    )
    yield* Effect.forEach(
      Array.chunksOf(claimedIds, MAX_NOTIFICATION_IDS),
      (chunk) => notificationRepo.markManyAsFailed(chunk, headline),
      { discard: true }
    )
    yield* alerter.alert({
      _tag: 'UnhandledDefect',
      source: 'notification-worker',
      message: `${topic}: ${headline}`,
      stack: Option.match(ids.messageId, {
        onNone: () => error,
        onSome: (id) => `message ${id}\n${error}`,
      }),
    })
  })

const MAX_STORED_DEPTH = 64

const isPostgresText = Schema.is(PostgresText)

const childrenOf = (value: unknown): ReadonlyArray<unknown> => {
  if (Array.isArray(value)) return value
  if (Predicate.isObject(value)) return Array.flatten(Record.toEntries(value))
  return []
}

const isStorableJson = (root: unknown): boolean => {
  const pending: Array<readonly [unknown, number]> = [[root, 0]]
  for (let next = pending.pop(); next; next = pending.pop()) {
    const [value, depth] = next
    if (Predicate.isString(value) && !isPostgresText(value)) return false
    if (Predicate.isObjectOrArray(value) && depth >= MAX_STORED_DEPTH)
      return false
    for (const child of childrenOf(value)) pending.push([child, depth + 1])
  }
  return true
}

const storablePayload = (
  entry: Option.Option<unknown>,
  rawData: string
): object | string =>
  pipe(
    entry,
    Option.filter(
      (value): value is object =>
        Predicate.isObjectOrArray(value) && isStorableJson(value)
    ),
    Option.getOrElse(() => toPostgresText(rawData))
  )

const discardUndecodable = (error: QueueMessageDecodeError) =>
  Effect.gen(function* () {
    const queue = yield* MessageQueue
    const entry = readEntry(error.rawData)

    yield* discardPoisonMessage(
      pipe(
        Option.flatMap(entry, readTopic),
        Option.match({ onNone: () => 'unknown', onSome: (m) => m.topic })
      ),
      readPoisonIds(entry),
      storablePayload(entry, error.rawData),
      error.rawData,
      Str.replace(/\n\s*/g, ' ')(error.message)
    )
    yield* queue.ack(error.claim)
  })

export const consumeNext = Effect.gen(function* () {
  const queue = yield* MessageQueue

  const result = yield* queue.dequeue

  if (!result) return false

  const { message, rawData, claim } = result
  const { topic } = message

  const processDequeued = Effect.gen(function* () {
    yield* Effect.log('Processing notification', {
      topic,
      messageId: message.id,
      retryCount: message.retryCount,
    })

    yield* processMessage(message).pipe(
      Effect.catchTag(
        ['SqlError', 'PushSendError', 'PushConfigError'],
        (error) => retryLater(message, error)
      ),
      Effect.catchDefect((defect) =>
        discardPoisonMessage(
          topic,
          {
            messageId: Option.some(message.id),
            notificationIds: message.payload.notificationIds,
            malformedIds: [],
            retryCount: message.retryCount,
          },
          message,
          rawData,
          Cause.pretty(Cause.die(defect))
        )
      )
    )

    yield* queue.ack(claim)
  })

  const keepClaim = queue.refreshClaim(claim).pipe(
    Effect.catchTag('QueueOperationError', (error) =>
      Effect.logWarning('[notification-worker] Failed to refresh claim', {
        messageId: message.id,
        error: String(error),
      })
    ),
    Effect.delay(CLAIM_REFRESH_INTERVAL),
    Effect.forever
  )

  yield* processDequeued.pipe(
    Effect.raceFirst(keepClaim),
    Effect.withSpan('notification-worker.consume', {
      attributes: { topic },
    })
  )

  return true
}).pipe(
  Effect.catchTag('QueueMessageDecodeError', (error) =>
    Effect.as(discardUndecodable(error), true)
  )
)

export const recoverStrandedDeliveries = Effect.gen(function* () {
  const queue = yield* MessageQueue
  const notificationRepo = yield* NotificationDelivery

  // Rows are settled before messages go back on the queue: a worker can take a
  // requeued message at once, and a pre-fix message's row must already be
  // unclaimable by then.
  const now = DateTime.nowUnsafe()
  const released = yield* notificationRepo.releaseUnclaimedOlderThan(
    DateTime.toDateUtc(DateTime.subtractDuration(now, VISIBILITY_TIMEOUT))
  )
  const failed = yield* notificationRepo.failAbandonedDeliveries(
    DateTime.toDateUtc(DateTime.subtractDuration(now, DELIVERY_TIMEOUT)),
    'delivery not confirmed'
  )

  const requeued = yield* queue.requeueStale(VISIBILITY_TIMEOUT)

  if (requeued + released + failed > 0) {
    yield* Effect.logWarning('[notification-recovery] Recovered deliveries', {
      requeuedMessages: requeued,
      releasedRows: released,
      failedRows: failed,
    })
  }
}).pipe(Effect.withSpan('notification-recovery.sweep'))

const alertDefect = (consumer: number, defect: unknown) =>
  Effect.gen(function* () {
    const alerter = yield* Alerter
    const message = Cause.pretty(Cause.die(defect))
    yield* Effect.logError('[notification-worker] defect', {
      consumer,
      message,
    })
    yield* alerter.alert({
      _tag: 'UnhandledDefect',
      source: 'notification-worker',
      message,
    })
  })

const NotificationConsumers = Config.schema(
  Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 64 })),
  'NOTIFICATION_CONSUMERS'
).pipe(Config.withDefault(4))

export const startNotificationWorker = Effect.gen(function* () {
  const consumers = yield* NotificationConsumers

  // Fibers forked into one scope are interrupted one after another on close,
  // so each would get its own drain deadline. A parallel scope gives every
  // loop and the recovery sweep the same one.
  const workers = yield* Scope.fork(yield* Scope.Scope, 'parallel')

  yield* createScheduler({
    name: 'notification-recovery',
    interval: '5 minutes',
    runOnStartup: false,
    task: recoverStrandedDeliveries,
  }).pipe(Scope.provide(workers))

  yield* Effect.forEach(Array.range(1, consumers), (consumer) =>
    Effect.forkIn(
      Effect.forever(
        consumeNext.pipe(
          Effect.catchTags({
            SqlError: (e: SqlError) =>
              Effect.logError('[notification-worker] SQL error', {
                consumer,
                error: String(e),
              }).pipe(Effect.as(false)),
            QueueOperationError: (e) =>
              Effect.logError('[notification-worker] Queue operation error', {
                consumer,
                error: String(e),
              }).pipe(Effect.as(false)),
            QueueConnectionError: (e) =>
              Effect.logError('[notification-worker] Queue connection error', {
                consumer,
                error: String(e),
              }).pipe(Effect.as(false)),
          }),
          Effect.catchDefect((defect) =>
            alertDefect(consumer, defect).pipe(Effect.as(false))
          ),
          drainOnInterrupt('notification-worker'),
          // Only sleep when the queue was empty — drain fast under load
          Effect.flatMap((hadMessage) =>
            hadMessage ? Effect.void : Effect.sleep('5 seconds')
          )
        )
      ),
      workers
    )
  )

  yield* Effect.log('Notification workers started', { consumers })
})
