import { McpSchema, McpServer } from '@effect/ai'
import type { UserRepository } from '@lily/api/repositories/user.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import type { OAuthService } from '@lily/mcp/auth/oauth-service'
import { assertPlantAccess } from '@lily/mcp/auth/plant-access'
import { resolveAuthFromRequest } from '@lily/mcp/auth/resolve-user'
import {
  readCareScheduleResource,
  readPlantResource,
} from '@lily/mcp/resources'
import { Effect, Schema } from 'effect'

// ── Plant Resource (templated) ─────────────────────────────────────────

const plantIdParam = McpSchema.param('plantId', Schema.String)

/**
 * The plant resource requires bearer auth and verifies ownership
 * via assertPlantAccess before returning plant data.
 * The plant returned by assertPlantAccess is passed directly to
 * readPlantResource to avoid a redundant DB fetch.
 */
const authedPlantContent = (plantId: string) =>
  resolveAuthFromRequest.pipe(
    Effect.flatMap((user) =>
      assertPlantAccess(plantId).pipe(
        Effect.provideService(CurrentUser, user),
        Effect.flatMap((plant) => readPlantResource(plant)),
        Effect.catchTag('PlantNotFound', () =>
          Effect.succeed(JSON.stringify({ error: 'Plant not found' }))
        )
      )
    )
  ) as Effect.Effect<string, never, OAuthService | UserRepository>

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
 * auth resolution because findCareTasks() internally yields CurrentUser.
 *
 * Uses the shared resolveAuthFromRequest for token validation and user
 * resolution, keeping auth logic in a single place.
 */
const authedCareScheduleContent = resolveAuthFromRequest.pipe(
  Effect.flatMap((user) =>
    readCareScheduleResource().pipe(Effect.provideService(CurrentUser, user))
  )
) as Effect.Effect<string, never, OAuthService | UserRepository>

export const CareScheduleResourceLayer = McpServer.resource({
  uri: 'care-schedule://today',
  name: "Today's Care Schedule",
  description: "Today's care schedule as JSON",
  mimeType: 'application/json',
  content: authedCareScheduleContent,
})
