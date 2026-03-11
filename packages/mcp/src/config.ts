import { Array, Option, pipe, String } from 'effect'

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

export const MCP_ALLOWED_ORIGINS: string[] = pipe(
  Option.fromNullable(process.env.MCP_ALLOWED_ORIGINS),
  Option.map(String.split(',')),
  Option.map(Array.map(String.trim)),
  Option.map(Array.filter(String.isNonEmpty)),
  Option.getOrElse((): string[] => [])
)
