import { NotificationTopic } from '@lily/shared'
import { Data, pipe, Schema, String as Str } from 'effect'

const UNPAIRED_SURROGATE =
  /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g

// Postgres text and jsonb reject NUL and unpaired UTF-16 surrogates.
export const toPostgresText = (text: string) =>
  pipe(
    text,
    Str.replaceAll('\u0000', '\\u0000'),
    Str.replace(UNPAIRED_SURROGATE, '\ufffd')
  )

export const PostgresText = Schema.String.check(
  Schema.makeFilter(
    (value: string) =>
      toPostgresText(value) === value ||
      'Expected text without NUL or unpaired surrogates'
  )
)

export const NotificationId = Schema.String.check(Schema.isUUID())

// One statement binds at most 65535 parameters. Producers send at most 100 ids.
export const MAX_NOTIFICATION_IDS = 10_000

export const RetryCount = Schema.Int.check(
  Schema.isBetween({ minimum: 0, maximum: 2_147_483_647 })
)

// Queue message payload for notifications
export const QueueMessagePayload = Schema.Struct({
  userId: Schema.String,
  notificationIds: Schema.Array(NotificationId).check(
    Schema.isMaxLength(MAX_NOTIFICATION_IDS)
  ),
  plantIds: Schema.Array(Schema.String),
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.String)),
})
export type QueueMessagePayload = typeof QueueMessagePayload.Type

// Full queue message with metadata
export const QueueMessage = Schema.Struct({
  id: PostgresText,
  topic: NotificationTopic,
  payload: QueueMessagePayload,
  retryCount: RetryCount,
  createdAt: Schema.DateFromString,
  scheduledAt: Schema.DateFromString,
})
export type QueueMessage = typeof QueueMessage.Type

export class QueueConnectionError extends Data.TaggedError(
  'QueueConnectionError'
)<{
  message: string
  cause?: unknown
}> {}

export class QueueOperationError extends Data.TaggedError(
  'QueueOperationError'
)<{
  message: string
  cause?: unknown
}> {}

export class QueueMessageDecodeError extends Schema.TaggedError<
  QueueMessageDecodeError,
  { readonly brand: unique symbol }
>()('QueueMessageDecodeError', {
  rawData: Schema.String,
  claim: Schema.String,
  message: Schema.String,
}) {}
