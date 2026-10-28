import { createMockApiClient } from '@lily/mcp/__tests__/mocks/api-client'
import { canopyPlant, makePlant } from '@lily/mcp/__tests__/mocks/plant'
import type { IApiClient } from '@lily/mcp/api-client'
import { OAuthRepository } from '@lily/mcp/auth/oauth-repository'
import { OAuthService } from '@lily/mcp/auth/oauth-service'
import { ToolsLayer } from '@lily/mcp/tools/handlers'
import { ExternalServiceError } from '@lily/shared'
import type { EnhancedPlantCreateRequest } from '@lily/shared/plant'
import { Array, Effect, Layer, Option } from 'effect'
import { McpSchema, McpServer } from 'effect/ai'
import { HttpServerRequest } from 'effect/http'
import { describe, expect, it } from 'vitest'

const unexpiredJwt = `h.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))}.s`
const clientInfo = { name: 'create-plant-test', version: '1.0.0' }

const apiRefusal = (statusCode: number) =>
  new ExternalServiceError({
    service: 'lily-api',
    method: 'POST',
    url: 'http://api-withlily.railway.internal:3000/api/plants',
    statusCode,
    message: `StatusCode: non 2xx status code (${statusCode} POST)`,
  })

const withServer = <A, E>(
  createPlant: IApiClient['createPlant'],
  body: Effect.Effect<A, E, McpServer.McpServer | McpSchema.McpServerClient>
) =>
  body.pipe(
    Effect.provideService(
      HttpServerRequest.HttpServerRequest,
      HttpServerRequest.fromWeb(
        new Request('http://test.local/mcp', {
          method: 'POST',
          headers: { authorization: 'Bearer oauth-token' },
        })
      )
    ),
    Effect.provide(
      ToolsLayer.pipe(
        Layer.merge(
          Layer.mock(McpSchema.McpServerClient)({
            clientId: 1,
            protocolVersion: '2025-06-18',
            clientCapabilities: {},
            clientInfo,
            initializePayload: {
              protocolVersion: '2025-06-18',
              capabilities: {},
              clientInfo,
            },
          })
        ),
        Layer.provideMerge(McpServer.McpServer.layer),
        Layer.provide(
          Layer.mergeAll(
            createMockApiClient({ createPlant }),
            Layer.mock(OAuthService)({
              validateBearerToken: () =>
                Effect.succeed({ userId: 'user-1', scopes: ['plants:write'] }),
            }),
            Layer.mock(OAuthRepository)({
              getUserApiCredentials: (userId) =>
                Effect.succeed(
                  Option.some({
                    userId,
                    apiJwt: unexpiredJwt,
                    apiRefreshToken: 'api-refresh',
                  })
                ),
            })
          )
        )
      )
    ),
    Effect.runPromise
  )

const callCreatePlant = (
  args: Record<string, unknown>,
  createPlant: IApiClient['createPlant']
) =>
  withServer(
    createPlant,
    Effect.gen(function* () {
      const server = yield* McpServer.McpServer
      const result = yield* server.callTool({
        name: 'create_plant',
        arguments: args,
      })
      return {
        isError: result.isError === true,
        text: result.content
          .map((part) => (part.type === 'text' ? part.text : ''))
          .join(''),
      }
    })
  )

describe('create_plant tool', () => {
  it('creates a Canopy plant when canopy is true and names the Canopy', async () => {
    const sent: EnhancedPlantCreateRequest[] = []

    const result = await callCreatePlant(
      { name: 'Shared Fern', wateringFrequencyDays: 5, canopy: true },
      (body) => {
        sent.push(body)
        return Effect.succeed(canopyPlant)
      }
    )

    expect(sent).toEqual([
      {
        name: 'Shared Fern',
        wateringFrequencyDays: 5,
        luxNeeded: 2000,
        petToxicityRating: 100,
        owner: 'canopy',
      },
    ])
    expect(result.isError).toBe(false)
    expect(result.text).toContain('Canopy: Maple House')
  })

  it('creates a personal plant when canopy is left out', async () => {
    const sent: EnhancedPlantCreateRequest[] = []

    const result = await callCreatePlant(
      { name: 'Monstera', wateringFrequencyDays: 7, petSafe: true },
      (body) => {
        sent.push(body)
        return Effect.succeed(makePlant())
      }
    )

    expect(
      Array.map(sent, (body) => [body.owner, body.petToxicityRating])
    ).toEqual([['me', 0]])
    expect(result.text).not.toContain('Canopy')
  })

  it('tells a user without a Canopy that they have none', async () => {
    const result = await callCreatePlant(
      { name: 'Shared Fern', wateringFrequencyDays: 5, canopy: true },
      () => Effect.fail(apiRefusal(404))
    )

    expect(result).toEqual({
      isError: true,
      text: expect.stringContaining('You are not in a Canopy'),
    })
  })

  it('reports the plant limit instead of not found', async () => {
    const result = await callCreatePlant(
      { name: 'Monstera', wateringFrequencyDays: 7 },
      () => Effect.fail(apiRefusal(403))
    )

    expect(result.isError).toBe(true)
    expect(result.text).toContain('plant limit')
    expect(result.text).not.toContain('Not found')
  })

  it('documents the canopy option in tools/list', async () => {
    const tool = await withServer(
      () => Effect.die('unused'),
      Effect.gen(function* () {
        const server = yield* McpServer.McpServer
        return Array.findFirst(
          server.tools,
          ({ tool }) => tool.name === 'create_plant'
        )
      })
    )

    expect(Option.map(tool, ({ tool }) => tool.inputSchema)).toEqual(
      Option.some(
        expect.objectContaining({
          required: ['name', 'wateringFrequencyDays'],
          properties: expect.objectContaining({
            canopy: expect.objectContaining({
              type: 'boolean',
              description: expect.stringContaining('Canopy'),
            }),
          }),
        })
      )
    )
  })

  it('trims the name it sends', async () => {
    const sent: EnhancedPlantCreateRequest[] = []

    await callCreatePlant(
      { name: '  Fern  ', wateringFrequencyDays: 7 },
      (body) => {
        sent.push(body)
        return Effect.succeed(makePlant())
      }
    )

    expect(Array.map(sent, (body) => body.name)).toEqual(['Fern'])
  })

  it.each([
    ['blank', '   '],
    ['longer than 100 characters', 'x'.repeat(101)],
  ])('refuses a %s name without calling the API', async (_, name) => {
    const sent: EnhancedPlantCreateRequest[] = []

    const result = await callCreatePlant(
      { name, wateringFrequencyDays: 7 },
      (body) => {
        sent.push(body)
        return Effect.succeed(makePlant())
      }
    )

    expect(result.isError).toBe(true)
    expect(sent).toEqual([])
  })

  it('tells clients that it adds without destroying', async () => {
    const tool = await withServer(
      () => Effect.die('unused'),
      Effect.gen(function* () {
        const server = yield* McpServer.McpServer
        return Array.findFirst(
          server.tools,
          ({ tool }) => tool.name === 'create_plant'
        )
      })
    )

    expect(
      Option.map(tool, ({ tool }) => [
        tool.annotations?.destructiveHint,
        tool.inputSchema.properties?.name,
      ])
    ).toEqual(
      Option.some([
        false,
        expect.objectContaining({
          minLength: 1,
          maxLength: 100,
          description: expect.stringContaining('plant name'),
        }),
      ])
    )
  })
})
