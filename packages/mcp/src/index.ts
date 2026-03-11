import { McpServer } from '@effect/ai'
import {
  HttpMiddleware,
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from '@effect/platform'
import { BunHttpServer, BunRuntime } from '@effect/platform-bun'
import { confirmHandler } from '@lily/mcp/auth/confirm'
import { consentHandler } from '@lily/mcp/auth/consent'
import { OAuthRoutes } from '@lily/mcp/auth/oauth-routes'
import { verifyHandler } from '@lily/mcp/auth/verify'
import { MCP_ALLOWED_ORIGINS, MCP_PORT, MCP_SERVER_URL } from '@lily/mcp/config'
import { McpLive } from '@lily/mcp/layers'
import {
  CareScheduleResourceLayer,
  PlantResourceLayer,
} from '@lily/mcp/resources/layers'
import { PlantToolkit } from '@lily/mcp/tools/definitions'
import { PlantToolkitHandlersLive } from '@lily/mcp/tools/handlers'
import { Array, Effect, String as EffectString, Layer, pipe } from 'effect'

// ── MCP Auth Middleware ────────────────────────────────────────────────

const resourceMetadataUrl = `${MCP_SERVER_URL}/.well-known/oauth-protected-resource`

const mcpAuthMiddleware = HttpMiddleware.make((app) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest

    if (!pipe(request.url, EffectString.startsWith('/mcp'))) {
      return yield* app
    }

    // Allow OPTIONS preflight through without auth (safety net for CORS)
    if (request.method === 'OPTIONS') {
      return yield* app
    }

    const authHeader = request.headers.authorization

    if (!authHeader || !pipe(authHeader, EffectString.startsWith('Bearer '))) {
      return yield* HttpServerResponse.empty({ status: 401 }).pipe(
        Effect.map((res) =>
          res.pipe(
            HttpServerResponse.setHeader(
              'WWW-Authenticate',
              `Bearer resource_metadata="${resourceMetadataUrl}"`
            )
          )
        )
      )
    }

    return yield* app
  })
)

// ── CORS Middleware ──────────────────────────────────────────────────

const corsMiddleware = HttpMiddleware.cors({
  allowedOrigins: Array.isEmptyArray(MCP_ALLOWED_ORIGINS)
    ? () => true
    : [...MCP_ALLOWED_ORIGINS],
  allowedHeaders: ['Content-Type', 'Authorization', 'Mcp-Session-Id'],
  allowedMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  maxAge: 86400,
  credentials: true,
})

// ── Custom Routes (OAuth, consent, health) ─────────────────────────────

const AppRoutes = OAuthRoutes.pipe(
  HttpRouter.get('/consent', consentHandler),
  HttpRouter.post('/confirm', confirmHandler),
  HttpRouter.get('/verify', verifyHandler),
  HttpRouter.get(
    '/health',
    Effect.succeed(
      HttpServerResponse.unsafeJson({
        status: 'ok',
        service: 'lily-mcp',
      })
    )
  ),
  // MCP Streamable HTTP spec requires GET (SSE) and DELETE (session close)
  // at the MCP endpoint. @effect/ai only registers POST, so we add stub
  // handlers that return 405 to signal the method is not supported.
  HttpRouter.get(
    '/mcp',
    Effect.succeed(HttpServerResponse.empty({ status: 405 }))
  ),
  HttpRouter.del(
    '/mcp',
    Effect.succeed(HttpServerResponse.empty({ status: 405 }))
  )
)

/**
 * Register custom routes on the Default HttpRouter alongside MCP routes.
 *
 * McpServer.layerHttp handles /mcp internally on the Default router.
 * This layer adds OAuth, consent, and health routes to the same router.
 *
 * The type assertion is needed because Service.concat constrains the argument
 * to the same E/R as the Default router (DefaultServices). Our AppRoutes carry
 * extra service requirements (OAuthService, RateLimiterService, etc.) that are
 * provided at runtime via McpLive in the layer composition below.
 */
const CustomRoutesLayer = HttpRouter.Default.use((router) =>
  router.concat(AppRoutes as HttpRouter.HttpRouter)
)

// ── Server Layer ───────────────────────────────────────────────────────

const ServerLayer = Layer.mergeAll(
  // Register tools + resources with MCP server
  McpServer.toolkit(PlantToolkit),
  PlantResourceLayer,
  CareScheduleResourceLayer,
  // Register custom routes on Default router
  CustomRoutesLayer,
  // Serve the combined Default router with auth + CORS middleware
  // CORS wraps outside auth so CORS headers appear on 401 responses too
  HttpRouter.Default.serve((app) => corsMiddleware(mcpAuthMiddleware(app)))
).pipe(
  // Provide tool handler implementations
  Layer.provide(PlantToolkitHandlersLive),
  // Provide MCP server with HTTP transport at /mcp
  Layer.provide(
    McpServer.layerHttp({
      name: 'lily-plant-care',
      version: '1.0.0',
      path: '/mcp',
    })
  ),
  // Provide all repositories, services, and DB layers
  Layer.provide(McpLive),
  // Provide the HTTP server
  Layer.provide(
    BunHttpServer.layer({
      port: MCP_PORT,
      hostname: '0.0.0.0',
    })
  )
)

// ── Launch ──────────────────────────────────────────────────────────────

BunRuntime.runMain(
  Layer.launch(ServerLayer).pipe(
    Effect.tap(() =>
      Effect.log(
        `Lily MCP server running on port ${MCP_PORT}\n` +
          `  OAuth:     ${MCP_SERVER_URL}/.well-known/oauth-authorization-server\n` +
          `  Discovery: ${MCP_SERVER_URL}/.well-known/mcp.json\n` +
          `  MCP:       ${MCP_SERVER_URL}/mcp`
      )
    )
  )
)
