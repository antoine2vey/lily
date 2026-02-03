import { HttpApiEndpoint, HttpApiGroup } from '@effect/platform'
import { Schema } from 'effect'

const HealthStatus = Schema.Literal('ok', 'error')

const HealthResponse = Schema.Struct({
  status: Schema.Literal('ok', 'degraded'),
  database: HealthStatus,
  redis: HealthStatus,
})

// Health endpoint at root level (no /api prefix)
export const HealthApiGroup = HttpApiGroup.make('health').add(
  HttpApiEndpoint.get('check', '/health').addSuccess(HealthResponse)
)
