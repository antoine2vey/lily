import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { resolveCurrentUser } from '@lily/mcp/auth/resolve-user'
import {
  readCareScheduleResource,
  readPlantResource,
} from '@lily/mcp/resources'
import type { McpRuntimeContext } from '@lily/mcp/runtime'
import {
  askPlantQuestionEffect,
  carePlantEffect,
  getCareTasksEffect,
  getOverduePlantsEffect,
  getPlantDetailsEffect,
  listPlantsEffect,
  waterPlantEffect,
} from '@lily/mcp/tools'
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js'
import {
  McpServer,
  ResourceTemplate,
} from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ManagedRuntime } from 'effect'
import { Effect, Layer } from 'effect'
import { z } from 'zod'

/**
 * Creates a fully configured McpServer with all tools and resources
 * registered, scoped to the authenticated user.
 *
 * A new McpServer is created per-request because each request belongs
 * to a different authenticated user. The runtime is shared — only the
 * CurrentUser context varies per request.
 */
export const createMcpServer = (
  authInfo: AuthInfo & { userId?: string },
  runtime: ManagedRuntime.ManagedRuntime<McpRuntimeContext, never>
) => {
  const server = new McpServer({
    name: 'lily-plant-care',
    version: '1.0.0',
  })

  /**
   * Helper to run an Effect with the authenticated user's context.
   * Resolves the user from the OAuth token and provides it as CurrentUser.
   */
  const runWithUser = (
    effect: Effect.Effect<string, unknown, McpRuntimeContext | CurrentUser>
  ): Promise<string> =>
    runtime.runPromise(
      Effect.gen(function* () {
        const userProfile = yield* resolveCurrentUser(authInfo)
        return yield* Effect.provide(
          effect,
          Layer.succeed(CurrentUser, userProfile)
        )
      })
    )

  // ── Read-only Tools ────────────────────────────────────────────────

  // @ts-expect-error — MCP SDK tool() generic inference too deep with zod optional schemas
  server.tool(
    'list_plants',
    'Lists all your plants with their health status, room, and care info.',
    {
      filter: z
        .enum(['all', 'needsAttention', 'overdue'])
        .optional()
        .describe('Filter plants: all (default), needsAttention, or overdue'),
    },
    { readOnlyHint: true, openWorldHint: false },
    async (params) => ({
      content: [
        {
          type: 'text' as const,
          text: await runWithUser(
            listPlantsEffect({
              ...(params.filter != null ? { filter: params.filter } : {}),
            })
          ),
        },
      ],
    })
  )

  server.tool(
    'get_plant_details',
    'Get detailed information about a specific plant including care schedules and recent history.',
    {
      plantId: z.string().describe('The plant ID to get details for'),
    },
    { readOnlyHint: true, openWorldHint: false },
    async ({ plantId }) => ({
      content: [
        {
          type: 'text' as const,
          text: await runWithUser(getPlantDetailsEffect({ plantId })),
        },
      ],
    })
  )

  server.tool(
    'get_care_tasks',
    'Get pending care tasks grouped by overdue, today, and upcoming (7-day window).',
    { readOnlyHint: true, openWorldHint: false },
    async () => ({
      content: [
        {
          type: 'text' as const,
          text: await runWithUser(getCareTasksEffect()),
        },
      ],
    })
  )

  server.tool(
    'get_overdue_plants',
    'Lists plants that are overdue for care with details on what needs attention.',
    { readOnlyHint: true, openWorldHint: false },
    async () => ({
      content: [
        {
          type: 'text' as const,
          text: await runWithUser(getOverduePlantsEffect()),
        },
      ],
    })
  )

  // @ts-expect-error — MCP SDK tool() generic inference too deep with zod optional schemas
  server.tool(
    'ask_plant_question',
    'Search the plant care knowledge base. Returns relevant care advice from community and expert sources.',
    {
      question: z.string().describe('The plant care question to search for'),
      plantName: z
        .string()
        .optional()
        .describe('Optional plant name to focus the search (e.g. "Monstera")'),
    },
    { readOnlyHint: true, openWorldHint: false },
    async ({ question, plantName }) => ({
      content: [
        {
          type: 'text' as const,
          text: await runWithUser(
            askPlantQuestionEffect({
              question,
              ...(plantName != null ? { plantName } : {}),
            })
          ),
        },
      ],
    })
  )

  // ── Write Tools ────────────────────────────────────────────────────

  server.tool(
    'water_plant',
    'Record that you watered a plant. Creates a care log entry.',
    {
      plantId: z.string().describe('The plant ID to water'),
      notes: z
        .string()
        .optional()
        .describe('Optional notes about the watering'),
    },
    { readOnlyHint: false, openWorldHint: false },
    async ({ plantId, notes }) => ({
      content: [
        {
          type: 'text' as const,
          text: await runWithUser(
            waterPlantEffect({
              plantId,
              ...(notes != null ? { notes } : {}),
            })
          ),
        },
      ],
    })
  )

  // @ts-expect-error — MCP SDK tool() generic inference too deep with zod optional schemas
  server.tool(
    'care_plant',
    'Record a care action (watering or fertilization) for a plant.',
    {
      plantId: z.string().describe('The plant ID to care for'),
      type: z
        .enum(['watering', 'fertilization'])
        .describe('Type of care action'),
      notes: z.string().optional().describe('Optional notes about the care'),
    },
    { readOnlyHint: false, openWorldHint: false },
    async ({ plantId, type, notes }) => ({
      content: [
        {
          type: 'text' as const,
          text: await runWithUser(
            carePlantEffect({
              plantId,
              type,
              ...(notes != null ? { notes } : {}),
            })
          ),
        },
      ],
    })
  )

  // ── Resources ──────────────────────────────────────────────────────

  server.resource(
    'plant',
    new ResourceTemplate('plant://{plantId}', { list: undefined }),
    {
      description: 'Full plant details as JSON',
      mimeType: 'application/json',
    },
    async (uri, params) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: await runWithUser(readPlantResource(params.plantId as string)),
        },
      ],
    })
  )

  server.resource(
    'care-schedule-today',
    'care-schedule://today',
    {
      description: "Today's care schedule as JSON",
      mimeType: 'application/json',
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: await runWithUser(readCareScheduleResource()),
        },
      ],
    })
  )

  return server
}
