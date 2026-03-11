import { Option, pipe } from 'effect'

/**
 * Shared MCP server configuration constants.
 * Single source of truth for env-based config used across auth, routes, etc.
 */

export const MCP_PORT = pipe(
  Option.fromNullable(process.env.MCP_PORT),
  Option.map(Number),
  Option.getOrElse(() => 3001)
)

const stripTrailingSlash = (s: string) => (s.endsWith('/') ? s.slice(0, -1) : s)

export const MCP_SERVER_URL = pipe(
  Option.fromNullable(process.env.MCP_SERVER_URL),
  Option.getOrElse(() => `http://localhost:${MCP_PORT}`),
  stripTrailingSlash
)
