import { FetchHttpClient } from '@effect/platform'
import { DrizzleLive, PgLive } from '@lily/db'
import { ApiClientLive } from '@lily/mcp/api-client'
import { OAuthRepositoryLive } from '@lily/mcp/auth/oauth-repository'
import { OAuthServiceLive } from '@lily/mcp/auth/oauth-service'
import { Layer } from 'effect'

/**
 * Layer composition for the MCP server.
 *
 * Dramatically simplified from the original — no @lily/api dependency.
 * The MCP server is now a thin translation layer that makes HTTP calls
 * to the API server via ApiClient.
 *
 * - OAuthRepository + OAuthService: OAuth 2.1 flow (stored in MCP's own tables)
 * - ApiClient: HTTP client for all plant/care/knowledge operations
 * - FetchHttpClient: provides the HttpClient for ApiClient
 * - DrizzleLive + PgLive: database for OAuth tables only
 */

// OAuth infrastructure (MCP owns these tables)
// OAuthServiceLive depends on OAuthRepository, so use provideMerge
const OAuthLive = OAuthServiceLive.pipe(Layer.provideMerge(OAuthRepositoryLive))

// API client for all plant/care operations (replaces direct repository access)
const ApiLive = ApiClientLive

// Database layers — only for OAuth tables
const DbLive = Layer.mergeAll(DrizzleLive, PgLive)

// Chain layers: services → databases + HTTP client
export const McpLive = Layer.mergeAll(OAuthLive, ApiLive).pipe(
  Layer.provideMerge(DbLive),
  Layer.provideMerge(FetchHttpClient.layer)
)
