import { BunHttpServer, BunRuntime } from '@effect/platform-bun'
import { confirmHandler } from '@lily/mcp/auth/confirm'
import { consentHandler } from '@lily/mcp/auth/consent'
import { OAuthRoutes } from '@lily/mcp/auth/oauth-routes'
import { verifyHandler } from '@lily/mcp/auth/verify'
import { McpAllowedOrigins, McpPort, McpServerUrl } from '@lily/mcp/config'
import { McpLive } from '@lily/mcp/layers'
import {
  CareScheduleResourceLayer,
  PlantResourceLayer,
} from '@lily/mcp/resources/layers'
import { ToolsLayer } from '@lily/mcp/tools/handlers'
import { WidgetResourcesLayer } from '@lily/mcp/widgets/resources'
import { Effect, String as EffectString, Layer, pipe } from 'effect'
import { McpProtocol, McpServer } from 'effect/ai'
import {
  HttpMiddleware,
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from 'effect/http'

const MCP_PATH = '/mcp'

/**
 * Guards the MCP endpoint before routing:
 * - every non-preflight request needs a bearer token, else 401 pointing at
 *   the protected-resource metadata (starts the OAuth flow);
 * - `GET /mcp` answers 200. ChatGPT probes it before `tools/call` and stops
 *   dispatching on the 405 that `McpServer.layerHttp` registers for GET.
 */
const makeMcpEndpointMiddleware = (resourceMetadataUrl: string) =>
  HttpMiddleware.make((app) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest

      if (
        !pipe(request.url, EffectString.startsWith(MCP_PATH)) ||
        request.method === 'OPTIONS'
      ) {
        return yield* app
      }

      const authHeader = request.headers.authorization
      if (
        !authHeader ||
        !pipe(authHeader, EffectString.startsWith('Bearer '))
      ) {
        return HttpServerResponse.empty({
          status: 401,
          headers: {
            'WWW-Authenticate': `Bearer resource_metadata="${resourceMetadataUrl}"`,
          },
        })
      }

      if (request.method === 'GET' && request.url === MCP_PATH) {
        return HttpServerResponse.empty({ status: 200 })
      }

      return yield* app
    })
  )

const AppRoutes = Layer.mergeAll(
  OAuthRoutes,
  HttpRouter.add('GET', '/consent', consentHandler),
  HttpRouter.add('POST', '/confirm', confirmHandler),
  HttpRouter.add('GET', '/verify', verifyHandler),
  HttpRouter.add(
    'GET',
    '/health',
    HttpServerResponse.jsonUnsafe({ status: 'ok', service: 'lily-mcp' })
  )
)

/**
 * CORS wraps the endpoint guard so 401 responses carry CORS headers and
 * preflights are answered before auth. One middleware keeps that order
 * explicit; separately registered global middlewares have no build order.
 */
const MiddlewareLayer = Layer.unwrap(
  Effect.gen(function* () {
    const serverUrl = yield* McpServerUrl
    const origins = yield* McpAllowedOrigins
    const guard = makeMcpEndpointMiddleware(
      `${serverUrl}/.well-known/oauth-protected-resource`
    )
    const cors = HttpMiddleware.cors({
      allowedOrigins: origins,
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'Mcp-Session-Id',
        'MCP-Protocol-Version',
      ],
      exposedHeaders: ['Mcp-Session-Id', 'MCP-Protocol-Version'],
      allowedMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      maxAge: 86400,
      credentials: true,
    })
    return HttpRouter.middleware((app) => cors(guard(app)), { global: true })
  })
)

const McpHttpLayer = Layer.unwrap(
  Effect.map(McpAllowedOrigins, (allowedOrigins) =>
    McpServer.layerHttp({
      name: 'lily-plant-care',
      version: '1.0.0',
      path: MCP_PATH,
      protocols: [
        McpProtocol.v2025_06_18,
        McpProtocol.v2025_03_26,
        McpProtocol.v2024_11_05,
      ],
      allowedOrigins,
    })
  )
)

const ServerLayer = HttpRouter.serve(
  Layer.mergeAll(
    ToolsLayer,
    PlantResourceLayer,
    CareScheduleResourceLayer,
    WidgetResourcesLayer,
    AppRoutes,
    MiddlewareLayer
  ).pipe(Layer.provideMerge(McpHttpLayer)),
  { disableLogger: true }
).pipe(
  Layer.provide(McpLive),
  Layer.provide(
    Layer.unwrap(
      Effect.map(McpPort, (port) =>
        BunHttpServer.layer({ port, hostname: '0.0.0.0', idleTimeout: 120 })
      )
    )
  )
)

BunRuntime.runMain(Layer.launch(ServerLayer))
