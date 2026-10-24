import { createMockApiClient } from '@lily/mcp/__tests__/mocks/api-client'
import { OAuthRepository } from '@lily/mcp/auth/oauth-repository'
import { OAuthService } from '@lily/mcp/auth/oauth-service'
import type { Scope } from '@lily/mcp/auth/scopes'
import { ToolsLayer } from '@lily/mcp/tools/handlers'
import { ExternalServiceError } from '@lily/shared'
import { Effect, Layer, Option } from 'effect'
import { McpSchema, McpServer } from 'effect/ai'
import { HttpServerRequest } from 'effect/http'
import { describe, expect, it } from 'vitest'

const unexpiredJwt = `h.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))}.s`

const clientInfo = { name: 'scope-test', version: '1.0.0' }

const INTERNAL_URL =
  'http://api-withlily.railway.internal:3000/api/plants/someone-elses'

const callTool = (
  name: string,
  args: Record<string, unknown>,
  granted: readonly Scope[]
) =>
  Effect.gen(function* () {
    const server = yield* McpServer.McpServer
    const result = yield* server.callTool({ name, arguments: args })
    return {
      isError: result.isError === true,
      text: result.content
        .map((part) => (part.type === 'text' ? part.text : ''))
        .join(''),
    }
  }).pipe(
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
            createMockApiClient({
              getPlant: (plantId) =>
                Effect.fail(
                  new ExternalServiceError({
                    service: 'lily-api',
                    method: 'GET',
                    url: INTERNAL_URL,
                    statusCode: 403,
                    message: `StatusCode: non 2xx status code (403 GET ${INTERNAL_URL.replace('someone-elses', plantId)})`,
                  })
                ),
            }),
            Layer.mock(OAuthService)({
              validateBearerToken: () =>
                Effect.succeed({ userId: 'user-1', scopes: granted }),
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

describe('tool scopes', () => {
  it('runs a read tool for a token granted plants:read', async () => {
    const result = await callTool('list_plants', {}, ['plants:read'])

    expect(result.isError).toBe(false)
  })

  it('refuses a write tool for a read-only token', async () => {
    const result = await callTool(
      'care_plant',
      { plantId: 'p1', type: 'watering' },
      ['plants:read']
    )

    expect(result).toEqual({
      isError: true,
      text: expect.stringContaining('insufficient_scope'),
    })
  })

  it('refuses every tool for a token with no scopes', async () => {
    const result = await callTool('list_plants', {}, [])

    expect(result.text).toContain('insufficient_scope')
  })
})

describe('tool API failures', () => {
  it('reports a 403 from the API without the internal URL', async () => {
    const result = await callTool(
      'get_plant_details',
      { plantId: 'someone-elses' },
      ['plants:read']
    )

    expect(result.isError).toBe(true)
    expect(result.text).toBe('Not found, or not one of your plants.')
    expect(result.text).not.toContain('railway.internal')
  })
})
