/**
 * Authentication middleware
 *
 * This file re-exports from split modules for backwards compatibility:
 * - middleware.types.ts: Client-safe exports (no database imports)
 * - middleware.impl.ts: Server-only exports (has database imports)
 *
 * Use middleware.types for API definitions, middleware.impl for handlers.
 */

// Re-export implementation (server-only)
export { AuthenticationLive } from './middleware.impl'
// Re-export everything from types (client-safe)
export { Authentication, CurrentUser } from './middleware.types'
