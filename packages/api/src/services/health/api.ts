import { Schema } from 'effect'
import { HttpApiEndpoint, HttpApiGroup } from 'effect/http-api'

const DependencyStatus = Schema.Literals(['ok', 'error'])

const ReadyResponse = Schema.Struct({
  status: Schema.Literal('ok'),
  database: DependencyStatus,
  redis: DependencyStatus,
})

export class NotReadyError extends Schema.TaggedError<NotReadyError>()(
  'NotReadyError',
  {
    status: Schema.Literal('degraded'),
    database: DependencyStatus,
    redis: DependencyStatus,
  },
  { httpApiStatus: 503 }
) {}

// Health endpoints at root level (no /api prefix). `/health/live` answers
// while the process runs; `/health/ready` and `/health` answer 200 only when
// Postgres and Redis respond in time, else 503.
export const HealthApiGroup = HttpApiGroup.make('health')
  .add(
    HttpApiEndpoint.get('live', '/health/live', {
      success: Schema.Struct({ status: Schema.Literal('ok') }),
    })
  )
  .add(
    HttpApiEndpoint.get('ready', '/health/ready', {
      success: ReadyResponse,
      error: NotReadyError,
    })
  )
  .add(
    HttpApiEndpoint.get('check', '/health', {
      success: ReadyResponse,
      error: NotReadyError,
    })
  )
