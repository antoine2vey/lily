import { ActivityPushTokenRepository } from '@lily/api/repositories/activity-push-token.repository'
import type { CanopyRepository } from '@lily/api/repositories/canopy.repository'
import {
  type CreateDeadLetterData,
  DeadLetterRepository,
} from '@lily/api/repositories/dead-letter.repository'
import { DeviceTokenRepository } from '@lily/api/repositories/device-token.repository'
import {
  type DeferredNotification,
  type FailedAttempt,
  NotificationRepository,
  type NotificationRow,
} from '@lily/api/repositories/notification.repository'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { Alerter, logAndAlertWarning } from '@lily/api/services/alerting'
import { buildLiveActivityContentState } from '@lily/api/services/care-tasks/helpers/group-tasks'
import {
  createScheduler,
  drainOnInterrupt,
} from '@lily/api/services/helpers/create-scheduler'
import { retireStartTokenForDevice } from '@lily/api/services/live-activity/retire-start-token'
import {
  DEFER_MESSAGE,
  Decision,
  DROP_MESSAGE,
  decide,
  loadPlantFacts,
  loadRecipients,
} from '@lily/api/services/notification-scheduler/dispatch-gate'
import { buildCareDigestContent } from '@lily/api/services/notification-scheduler/translations'
import {
  type DeferredCareType,
  type InterruptionLevel,
  type LiveActivityAlert,
  type LiveActivityContentState,
  MAX_NOTIFICATION_IDS,
  MessageQueue,
  NotificationId,
  type NotificationTopic,
  PostgresText,
  type PushConfigError,
  type PushSendError,
  PushService,
  type QueueMessage,
  type QueueMessageDecodeError,
  RetryCount,
  TOPIC_CATEGORY,
  toPostgresText,
} from '@lily/shared/server'
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
  Result,
  Schedule,
  Schema,
  Scope,
  String as Str,
} from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

// How long a push-to-start we dispatched is presumed to still be alive on
// the device. A started activity only becomes visible to us once the device
// registers its update token, and that registration needs the app to run in
// the foreground with an unlocked keychain — a push-to-start that lands while
// the phone sits on the nightstand is confirmed hours later, if at all. Until
// that confirmation arrives, every further care message for the user (the
// overdue digest at a random morning slot, then the regular reminder at the
// preferred time) falls through to the start path and creates another
// identical card. So the guard spans the activity's own lifetime: it mirrors
// the 10h soft TTL after which the activity scheduler expires update rows,
// and stays well under the 24h cadence of the next day's reminder.
const LA_START_COOLDOWN = Duration.hours(10)

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

// Refresh the Live Activity card alongside a care reminder.
//
// The scheduler merges all of a user's due care reminders into one queue
// message, so this runs once per user per delivery batch. The start guard
// below covers what the merge cannot: worker retries, back-to-back polls, and
// a second care batch later the same day (overdue digests are scheduled at a
// random morning slot, regular reminders at the user's preferred time).
//
// Update path is silent — the regular Expo push already showed the banner.
// Start path requires an `alert` (iOS production drops push-to-start without
// one), so the caller passes title/body and we forward them. Users on the
// start path see two banners back-to-back (regular Expo + LA-start);
// consolidating to one is a separate UX change.
//
//   - Active update token → send an `update`.
//   - Else push-to-start token (iOS 17.2+) with no unresolved earlier start
//     → send a `start`.
//   - Else silently skip.
const sendLiveActivityForCare = (
  userId: string,
  startAlert: LiveActivityAlert
): Effect.Effect<
  void,
  SqlError,
  | PushService
  | ActivityPushTokenRepository
  | DeviceTokenRepository
  | import('@lily/api/repositories/care-log.repository').CareLogRepository
  | import('@lily/api/repositories/care-schedule.repository').CareScheduleRepository
  | UserRepository
  | CanopyRepository
> =>
  Effect.gen(function* () {
    const pushService = yield* PushService
    const activityRepo = yield* ActivityPushTokenRepository

    const contentState: LiveActivityContentState | null =
      yield* buildLiveActivityContentState(userId)
    if (!contentState) return

    const activeActivity =
      yield* activityRepo.findActiveActivityByUserId(userId)

    if (activeActivity) {
      const updateResult = yield* pushService
        .sendLiveActivity({
          _tag: 'LiveActivityUpdate',
          to: activeActivity.token,
          contentState,
        })
        .pipe(
          Effect.map(() => 'ok' as const),
          Effect.catchTags({
            PushSendError: (e) =>
              Effect.logWarning('[worker] LA update failed', {
                error: String(e),
              }).pipe(Effect.as('transient-fail' as const)),
            PushConfigError: (e) =>
              Effect.logWarning('[worker] LA update config error', {
                error: String(e),
              }).pipe(Effect.as('transient-fail' as const)),
            // Update token is dead — mark row as ended and fall through to
            // the start-token branch below so a fresh activity is created.
            PushTokenInvalidatedError: (e) =>
              Effect.gen(function* () {
                yield* Effect.logInfo(
                  '[worker] LA update token invalidated — retrying as start',
                  { reason: e.reason }
                )
                if (activeActivity.activityId) {
                  yield* activityRepo.markEnded(activeActivity.activityId)
                }
                return 'token-invalidated' as const
              }),
          })
        )
      if (updateResult !== 'token-invalidated') return
      // else: fall through to start-token path
    }

    const allStartTokens = yield* activityRepo.findStartTokensByUserId(userId)
    if (Array.isReadonlyArrayEmpty(allStartTokens)) {
      yield* Effect.logInfo('[worker] LA start skipped — no start tokens', {
        userId,
      })
      return
    }

    const cutoff = DateTime.toDateUtc(
      DateTime.subtractDuration(DateTime.nowUnsafe(), LA_START_COOLDOWN)
    )
    const claimedDeviceIds = yield* activityRepo.claimStartTokens(
      userId,
      Array.map(allStartTokens, (tok) => tok.deviceTokenId),
      cutoff
    )
    const startTokens = Array.filter(allStartTokens, (tok) =>
      Array.contains(claimedDeviceIds, tok.deviceTokenId)
    )
    const unresolved = allStartTokens.length - startTokens.length
    if (unresolved > 0) {
      yield* Effect.logInfo(
        '[worker] LA start skipped — earlier start still unconfirmed',
        { userId, skippedCount: unresolved }
      )
    }
    if (Array.isReadonlyArrayEmpty(startTokens)) return

    const activityId = crypto.randomUUID()
    yield* Effect.logInfo('[worker] LA start dispatching', {
      userId,
      activityId,
      startTokenCount: startTokens.length,
    })
    yield* Effect.forEach(
      startTokens,
      (tok) => {
        const logCtx = {
          userId,
          activityId,
          deviceTokenId: tok.deviceTokenId,
        }
        return pushService
          .sendLiveActivity({
            _tag: 'LiveActivityStart',
            to: tok.token,
            attributes: { userId, activityId },
            contentState,
            alert: startAlert,
          })
          .pipe(
            Effect.tap((ticket) =>
              Effect.logInfo('[worker] LA start accepted by APNs', {
                ...logCtx,
                apnsId: ticket.id,
              })
            ),
            Effect.catchTags({
              PushSendError: (e) =>
                Effect.logWarning('[worker] LA start failed', {
                  ...logCtx,
                  error: String(e),
                }),
              PushConfigError: (e) =>
                Effect.logWarning('[worker] LA start config error', {
                  ...logCtx,
                  error: String(e),
                }),
              PushTokenInvalidatedError: (e) =>
                Effect.logWarning(
                  '[worker] LA start-to-push token invalidated',
                  { ...logCtx, reason: e.reason }
                ).pipe(
                  Effect.andThen(retireStartTokenForDevice(tok.deviceTokenId))
                ),
            }),
            Effect.ignore
          )
      },
      { concurrency: 'unbounded' }
    )
  })

// Exponential backoff: 1s -> 2s -> 4s
export const workerRetryPolicy = Schedule.max([
  Schedule.exponential('1 second'),
  Schedule.recurs(3),
])

const completeDelivery = (
  message: QueueMessage,
  claimedIds: ReadonlyArray<string>,
  results: ReadonlyArray<{ status: 'ok' | 'error' }>,
  deviceCount: number
) =>
  Effect.gen(function* () {
    const notificationRepo = yield* NotificationRepository
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
      .markManyAsSent(claimedIds)
      .pipe(Effect.retry(workerRetryPolicy))

    // For care topics on iOS 17.2+ subscribers, refresh the LA card. Updates
    // are silent; starts re-use the regular banner's title/body as the LA
    // alert because production iOS drops alert-less push-to-start. Users on
    // the start path see the banner twice (regular + LA-start) — acceptable
    // for now; consolidating those is a separate UX change.
    if (TOPIC_CATEGORY[message.topic] === 'care') {
      yield* sendLiveActivityForCare(message.payload.userId, {
        title: message.payload.title,
        body: message.payload.body,
        sound: 'default',
      }).pipe(Effect.retry(workerRetryPolicy))
    }

    yield* Effect.log('Push notification sent', {
      notificationIds: claimedIds,
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
            notificationIds: claimedIds,
            error: String(error),
          }
        )
      })
    )
  ) satisfies Effect.Effect<void, never, unknown>

const isCareTopic = (topic: NotificationTopic): topic is DeferredCareType =>
  TOPIC_CATEGORY[topic] === 'care'

const gateClaimedRows = (
  message: QueueMessage,
  claimedIds: ReadonlyArray<string>
) =>
  Effect.gen(function* () {
    const notificationRepo = yield* NotificationRepository
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
    const [recipients, plantFacts] = yield* Effect.all([
      Effect.flatMap(
        userRepo.findByIds(Array.dedupe(Array.map(rows, (row) => row.userId))),
        (users) => loadRecipients(users, now)
      ),
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

    return { sendRows, plants }
  })

const careDigestFor = (
  message: QueueMessage,
  sendRows: ReadonlyArray<NotificationRow>,
  plants: ReadonlyArray<{ readonly id: string; readonly name: string }>
): Option.Option<QueueMessage> => {
  const kept = Array.filter(plants, (plant) =>
    Array.some(sendRows, (row) => row.plantId === plant.id)
  )
  const items = Array.filterMap(kept, (plant) =>
    Array.match(
      Array.filterMap(
        sendRows,
        Filter.fromPredicateOption((row) =>
          row.plantId === plant.id && isCareTopic(row.type)
            ? Option.some(row.type)
            : Option.none()
        )
      ),
      {
        onEmpty: () => Result.failVoid,
        onNonEmpty: (careTypes) =>
          Result.succeed({ plantName: plant.name, careTypes }),
      }
    )
  )
  return Array.match(items, {
    onEmpty: () => Option.none(),
    onNonEmpty: (nonEmpty) =>
      Option.some({
        ...message,
        payload: {
          ...message.payload,
          ...buildCareDigestContent(
            nonEmpty,
            Option.getOrElse(
              Option.fromNullishOr(message.payload.language),
              () => 'en' as const
            )
          ),
          notificationIds: Array.map(sendRows, (row) => row.id),
          plantIds: Array.map(kept, (plant) => plant.id),
        },
      }),
  })
}

export const processMessage = Effect.fn('notification-worker.process')(
  function* (message: QueueMessage) {
    const { notificationIds } = message.payload
    yield* Effect.annotateCurrentSpan('notification.ids', notificationIds)
    yield* Effect.annotateCurrentSpan('userId', message.payload.userId)
    const pushService = yield* PushService
    const deviceTokenRepo = yield* DeviceTokenRepository
    const notificationRepo = yield* NotificationRepository

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

    const { sendRows, plants } = yield* gateClaimedRows(message, claimedIds)
    if (Array.isReadonlyArrayEmpty(sendRows)) {
      yield* Effect.log('Skipping message - the gate kept no row', {
        messageId: message.id,
        notificationIds: claimedIds,
      })
      return
    }
    const sendIds = Array.map(sendRows, (row) => row.id)
    const unchanged =
      sendIds.length === Array.dedupe(message.payload.notificationIds).length
    const narrowed =
      unchanged || !isCareTopic(message.topic)
        ? Option.some(message)
        : careDigestFor(message, sendRows, plants)
    if (Option.isNone(narrowed)) {
      yield* Effect.log('Dropping care push - no care row left to name', {
        messageId: message.id,
        notificationIds: sendIds,
      })
      yield* notificationRepo.markManyAsSent(sendIds)
      return
    }
    const delivery = narrowed.value
    const { payload } = delivery

    // Get user's active device tokens
    const tokens = yield* deviceTokenRepo.findByUserId(message.payload.userId)
    const activeTokens = Array.filter(tokens, (t) => t.isActive)

    if (activeTokens.length === 0) {
      yield* Effect.logWarning('No active device tokens for user', {
        userId: message.payload.userId,
        notificationIds: sendIds,
      })
      // Still mark as sent since there's no device to send to
      yield* notificationRepo.markManyAsSent(sendIds)
      return
    }

    // Build data payload for deep linking
    const plantIds = Array.match(payload.plantIds, {
      onEmpty: () => Option.none<string>(),
      onNonEmpty: (ids) => Option.some(Array.join(ids, ',')),
    })

    const data: Record<string, unknown> = Record.filter(
      {
        topic: message.topic,
        title: payload.title,
        body: payload.body,
        plantIds: Option.getOrUndefined(plantIds),
        ...Record.map(message.payload.metadata ?? {}, (v) => v),
      } as Record<string, unknown>,
      (v) => v !== undefined
    )

    const interruptionLevel = resolveInterruptionLevel(message.topic)

    // Send to all active devices
    const pushMessages = Array.map(activeTokens, (token) => ({
      to: token.token,
      title: payload.title,
      body: payload.body,
      sound: 'default' as const,
      data,
      ...(interruptionLevel ? { interruptionLevel } : {}),
    }))

    const results = yield* pushService.sendBatch(pushMessages)

    yield* completeDelivery(delivery, sendIds, results, activeTokens.length)
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
  const notificationRepo = yield* NotificationRepository
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

const readLegacyIds = (rawData: string) => {
  const ids = readPoisonIds(readEntry(rawData))
  const lost =
    Array.isReadonlyArrayEmpty(ids.notificationIds) ||
    Array.isReadonlyArrayNonEmpty(ids.malformedIds)
  return lost
    ? Effect.as(
        Effect.logWarning(
          '[notification-recovery] Legacy entry has unreadable notification ids',
          {
            messageId: Option.getOrUndefined(ids.messageId),
            malformedIds: ids.malformedIds,
            entry: Str.slice(0, 200)(rawData),
          }
        ),
        ids.notificationIds
      )
    : Effect.succeed(ids.notificationIds)
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
    const notificationRepo = yield* NotificationRepository

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
  const notificationRepo = yield* NotificationRepository

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

  const legacyEntries = yield* queue.drainLegacyTopicLists
  const legacyIds = yield* Effect.forEach(legacyEntries, readLegacyIds)
  yield* Effect.forEach(
    Array.chunksOf(Array.flatten(legacyIds), MAX_NOTIFICATION_IDS),
    notificationRepo.releaseUnclaimed,
    { discard: true }
  )

  if (requeued + released + failed + legacyEntries.length > 0) {
    yield* Effect.logWarning('[notification-recovery] Recovered deliveries', {
      drainedLegacyMessages: legacyEntries.length,
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
