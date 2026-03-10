import type * as PgDrizzle from '@effect/sql-drizzle/Pg'
import type { CareLogRepository } from '@lily/api/repositories/care-log.repository'
import { CareLogRepositoryLive } from '@lily/api/repositories/care-log.repository'
import type { CareScheduleRepository } from '@lily/api/repositories/care-schedule.repository'
import { CareScheduleRepositoryLive } from '@lily/api/repositories/care-schedule.repository'
import type { MagicLinkRepository } from '@lily/api/repositories/magic-link.repository'
import { MagicLinkRepositoryLive } from '@lily/api/repositories/magic-link.repository'
import type { NotificationRepository } from '@lily/api/repositories/notification.repository'
import { NotificationRepositoryLive } from '@lily/api/repositories/notification.repository'
import type { PlantRepository } from '@lily/api/repositories/plant.repository'
import { PlantRepositoryLive } from '@lily/api/repositories/plant.repository'
import type { ProcessedChunkRepository } from '@lily/api/repositories/processed-chunk.repository'
import { ProcessedChunkRepositoryLive } from '@lily/api/repositories/processed-chunk.repository'
import type { UserRepository } from '@lily/api/repositories/user.repository'
import { UserRepositoryLive } from '@lily/api/repositories/user.repository'
import { InMemoryEventBusLive } from '@lily/api/services/event-bus/memory.provider'
import { RagService } from '@lily/api/services/rag/service'
import type { RateLimiterService } from '@lily/api/services/rate-limiter/service'
import { RateLimiterServiceLive } from '@lily/api/services/rate-limiter/service'
import { DrizzleLive, PgLive } from '@lily/db'
import { KnowledgeDrizzleLive } from '@lily/knowledge-db'
import type { EventBus } from '@lily/shared/server'
import { Layer, ManagedRuntime } from 'effect'

/**
 * The full context available to all MCP operations.
 *
 * This is the union of all services and repositories that tools/resources
 * may require. CurrentUser is NOT included here — it's resolved per-request
 * and provided dynamically via Layer.succeed.
 */
export type McpRuntimeContext =
  | PlantRepository
  | CareScheduleRepository
  | CareLogRepository
  | UserRepository
  | NotificationRepository
  | MagicLinkRepository
  | ProcessedChunkRepository
  | EventBus
  | RagService
  | RateLimiterService
  | PgDrizzle.PgDrizzle

/**
 * Layer composition for the MCP server.
 *
 * The layer stack follows the same pattern as the API server but is lighter:
 * - No HTTP server, no schedulers, no workers
 * - Uses InMemoryEventBus (fire-and-forget, no Redis needed)
 * - RagService for the ask_plant_question tool
 * - All repositories share the same PgDrizzle connection pool
 */
const RepositoriesLive = Layer.mergeAll(
  PlantRepositoryLive,
  CareScheduleRepositoryLive,
  CareLogRepositoryLive,
  UserRepositoryLive,
  NotificationRepositoryLive,
  MagicLinkRepositoryLive,
  ProcessedChunkRepositoryLive
)

const ServicesLive = Layer.mergeAll(
  RagService.Default,
  InMemoryEventBusLive,
  RateLimiterServiceLive
)

// Database layers — main DB + knowledge DB for RAG embeddings
const DbLive = Layer.mergeAll(DrizzleLive, PgLive)
const KnowledgeDbLive = KnowledgeDrizzleLive

// Chain layers so services can access repositories (e.g. RagService → ProcessedChunkRepository).
// ProcessedChunkRepository needs KnowledgeDrizzle, all others need PgDrizzle.
const McpLive = ServicesLive.pipe(
  Layer.provideMerge(RepositoriesLive),
  Layer.provideMerge(DbLive),
  Layer.provideMerge(KnowledgeDbLive)
)

/**
 * ManagedRuntime for the MCP server.
 *
 * This boots the full layer stack (DB connections, repos, services) once
 * at startup and keeps them alive for the server's lifetime. Each MCP
 * request uses this runtime to execute Effect programs.
 */
export const mcpRuntime = ManagedRuntime.make(McpLive)
