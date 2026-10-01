import { Schema } from 'effect'
import { HttpApiEndpoint, HttpApiGroup } from 'effect/http-api'

const HealthStatus = Schema.Literals(['ok', 'error'])

const HealthResponse = Schema.Struct({
  status: Schema.Literals(['ok', 'degraded']),
  database: HealthStatus,
  redis: HealthStatus,
})

// Health endpoint at root level (no /api prefix)
export const HealthApiGroup = HttpApiGroup.make('health').add(
  HttpApiEndpoint.get('check', '/health', {
    success: HealthResponse,
  })
)
