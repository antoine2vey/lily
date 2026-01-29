/**
 * Shared Layer Exports
 *
 * Re-exports layers from their original locations for convenient importing.
 * This module provides a single import point for common layer dependencies.
 *
 * Usage:
 * ```typescript
 * import { AuthenticationLive, RedisClientLive } from '@lily/api/layers'
 * ```
 */

import { BunContext } from '@effect/platform-bun'
import { RedisEventBusLive } from '@lily/api/events'
import { RedisClientLive } from '@lily/api/services/message-queue/redis.provider'
import { FileService } from '@lily/shared/services/file/fileservice'
import { GCSService } from '@lily/shared/services/file/gcs'
import { Layer } from 'effect'

// ============================================================================
// Auth Layers
// ============================================================================

export { AdminAuthLive } from '@lily/api/services/admin/middleware.impl'
export { AuthenticationLive } from '@lily/api/services/auth/middleware.impl'
export { JWTServiceLive } from '@lily/api/services/jwt/service'
export { RateLimiterServiceLive } from '@lily/api/services/rate-limiter/service'

// ============================================================================
// Infrastructure Layers
// ============================================================================

export { RedisEventBusLive } from '@lily/api/events'
export {
  RedisClientLive,
  RedisMessageQueueLive,
} from '@lily/api/services/message-queue/redis.provider'
export { ExpoPushServiceLive } from '@lily/api/services/push/expo.provider'

// ============================================================================
// Subscription Layers
// ============================================================================

export { LimitCheckerLive } from '@lily/api/services/subscriptions/limit-checker'
export { RevenueCatProviderLive } from '@lily/api/services/subscriptions/providers/revenuecat.provider'
export { UsageTrackerLive } from '@lily/api/services/subscriptions/usage-tracker'

// ============================================================================
// AI Layers
// ============================================================================

export { AiService } from '@lily/api/services/ai/service'

// ============================================================================
// File Storage Layers
// ============================================================================

export { FileService } from '@lily/shared/services/file/fileservice'
export { GCSService } from '@lily/shared/services/file/gcs'

// ============================================================================
// Platform Layers
// ============================================================================

export { BunContext } from '@effect/platform-bun'

// ============================================================================
// Pre-composed Layer Groups
// These are commonly used together and don't have interdependencies
// ============================================================================

/**
 * File storage services (GCS + FileService abstraction)
 * These layers don't depend on any other application layers
 */
export const FileStorageLayers = Layer.mergeAll(
  GCSService.Default,
  FileService.Default
)

/**
 * Redis-based infrastructure layers
 * RedisEventBusLive depends on RedisClientLive, so we provide it here
 */
export const RedisInfrastructureLayers = RedisEventBusLive.pipe(
  Layer.provideMerge(RedisClientLive)
)

/**
 * Platform context (Bun)
 */
export const PlatformLayers = BunContext.layer
