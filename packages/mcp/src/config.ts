import { Array, Config, pipe, String } from 'effect'

const stripTrailingSlash = (s: string) =>
  pipe(s, String.endsWith('/')) ? s.slice(0, -1) : s

export const McpPort = Config.integer('MCP_PORT').pipe(Config.withDefault(3001))

export const McpServerUrl = Config.nonEmptyString('MCP_SERVER_URL').pipe(
  Config.withDefault('http://localhost:3001'),
  Config.map(stripTrailingSlash)
)

export const McpAllowedOrigins = Config.string('MCP_ALLOWED_ORIGINS').pipe(
  Config.map(String.split(',')),
  Config.map(Array.map(String.trim)),
  Config.map(Array.filter(String.isNonEmpty)),
  Config.withDefault([] as readonly string[])
)
