import { CareLogRepositoryLive } from '@lily/api/repositories/care-log.repository'
import { CareScheduleRepositoryLive } from '@lily/api/repositories/care-schedule.repository'
import { MagicLinkRepositoryLive } from '@lily/api/repositories/magic-link.repository'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import { ProcessedChunkRepositoryLive } from '@lily/api/repositories/processed-chunk.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { InMemoryEventBusLive } from '@lily/api/services/event-bus/memory.provider'
import { RagService } from '@lily/api/services/rag/service'
import { RateLimiterServiceLive } from '@lily/api/services/rate-limiter/service'
import { DrizzleLive, PgLive } from '@lily/db'
import { KnowledgeDrizzleLive } from '@lily/knowledge-db'
import { OAuthRepositoryLive } from '@lily/mcp/auth/oauth-repository'
import { OAuthServiceLive } from '@lily/mcp/auth/oauth-service'
import { Layer } from 'effect'

/**
 * Layer composition for the MCP server.
 *
 * Follows the same pattern as the API server but lighter:
 * - No HTTP API endpoints, no schedulers, no workers
 * - Uses InMemoryEventBus (fire-and-forget, no Redis)
 * - RagService for the ask_plant_question tool
 * - OAuthRepository + OAuthService for the OAuth 2.1 flow
 * - All repositories share the same PgDrizzle connection pool
 */

const RepositoriesLive = Layer.mergeAll(
  PlantRepositoryLive,
  CareScheduleRepositoryLive,
  CareLogRepositoryLive,
  UserRepositoryLive,
  NotificationRepositoryLive,
  MagicLinkRepositoryLive,
  ProcessedChunkRepositoryLive,
  OAuthRepositoryLive
)

const ServicesLive = Layer.mergeAll(
  RagService.Default,
  InMemoryEventBusLive,
  RateLimiterServiceLive,
  OAuthServiceLive
)

// Database layers — main DB + knowledge DB for RAG embeddings
const DbLive = Layer.mergeAll(DrizzleLive, PgLive)
const KnowledgeDbLive = KnowledgeDrizzleLive

// Chain layers: services → repositories → databases
export const McpLive = ServicesLive.pipe(
  Layer.provideMerge(RepositoriesLive),
  Layer.provideMerge(DbLive),
  Layer.provideMerge(KnowledgeDbLive)
)
