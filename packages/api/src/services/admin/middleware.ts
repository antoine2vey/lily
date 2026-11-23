/**
 * Admin authorization middleware
 *
 * This file re-exports from split modules for backwards compatibility:
 * - middleware.types.ts: Client-safe exports (no database imports)
 * - middleware.impl.ts: Server-only exports (has database imports)
 *
 * Use middleware.types for API definitions, middleware.impl for handlers.
 */

export { AdminAuthLive } from './middleware.impl'
export { AdminAuth, AdminUser } from './middleware.types'
