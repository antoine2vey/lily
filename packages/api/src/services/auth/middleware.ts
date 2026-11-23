/**
 * Authentication middleware
 *
 * This file re-exports from split modules for backwards compatibility:
 * - middleware.types.ts: Client-safe exports (no database imports)
 * - middleware.impl.ts: Server-only exports (has database imports)
 *
 * Use middleware.types for API definitions, middleware.impl for handlers.
 */

export { AuthenticationLive } from './middleware.impl'
export { Authentication, CurrentUser } from './middleware.types'
