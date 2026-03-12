import { McpSchema, McpServer } from '@effect/ai'
import { ApiClient } from '@lily/mcp/api-client'
import { provideAuth } from '@lily/mcp/auth/resolve-user'
import {
  readCareScheduleResource,
  readPlantResource,
} from '@lily/mcp/resources'
import { Effect, Schema } from 'effect'

// ── Plant Resource (templated) ─────────────────────────────────────────

const plantIdParam = McpSchema.param('plantId', Schema.String)

/**
 * The plant resource requires bearer auth and fetches plant details
 * from the API. CurrentJwt is provided via provideAuth.
 */
const authedPlantContent = (plantId: string) =>
  Effect.gen(function* () {
    const apiClient = yield* ApiClient
    const plant = yield* apiClient.getPlant(plantId)
    return yield* readPlantResource(plant)
  }).pipe(
    provideAuth,
    Effect.catchTag('OAuthError', () =>
      Effect.succeed(JSON.stringify({ error: 'Authentication required' }))
    )
  )

export const PlantResourceLayer = McpServer.resource`plant://${plantIdParam}`({
  name: 'Plant Details',
  description: 'Full plant details as JSON',
  mimeType: 'application/json',
  content: Effect.fn(function* (_uri, plantId) {
    return yield* authedPlantContent(plantId)
  }),
})

// ── Care Schedule Resource (static) ────────────────────────────────────

/**
 * The care schedule resource wraps readCareScheduleResource() with bearer
 * auth resolution. CurrentJwt is provided via provideAuth.
 */
const authedCareScheduleContent = readCareScheduleResource().pipe(
  provideAuth,
  Effect.catchTag('OAuthError', () =>
    Effect.succeed(JSON.stringify({ error: 'Authentication required' }))
  )
)

export const CareScheduleResourceLayer = McpServer.resource({
  uri: 'care-schedule://today',
  name: "Today's Care Schedule",
  description: "Today's care schedule as JSON",
  mimeType: 'application/json',
  content: authedCareScheduleContent,
})
