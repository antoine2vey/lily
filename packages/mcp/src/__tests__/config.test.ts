import { McpAllowedOrigins, McpPort, McpServerUrl } from '@lily/mcp/config'
import { ConfigProvider, Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const runWith = (env: Record<string, string>) =>
  Effect.provide(Layer.setConfigProvider(ConfigProvider.fromJson(env)))

describe('MCP config', () => {
  describe('McpPort', () => {
    it('should default to 3001 when not set', async () => {
      const result = await McpPort.pipe(runWith({}), Effect.runPromise)
      expect(result).toBe(3001)
    })

    it('should use env value when set', async () => {
      const result = await McpPort.pipe(
        runWith({ MCP_PORT: '4000' }),
        Effect.runPromise
      )
      expect(result).toBe(4000)
    })
  })

  describe('McpServerUrl', () => {
    it('should default to http://localhost:3001 when not set', async () => {
      const result = await McpServerUrl.pipe(runWith({}), Effect.runPromise)
      expect(result).toBe('http://localhost:3001')
    })

    it('should use env value when set', async () => {
      const result = await McpServerUrl.pipe(
        runWith({ MCP_SERVER_URL: 'https://mcp.example.com' }),
        Effect.runPromise
      )
      expect(result).toBe('https://mcp.example.com')
    })

    it('should strip trailing slash', async () => {
      const result = await McpServerUrl.pipe(
        runWith({ MCP_SERVER_URL: 'https://mcp.example.com/' }),
        Effect.runPromise
      )
      expect(result).toBe('https://mcp.example.com')
    })
  })

  describe('McpAllowedOrigins', () => {
    it('should default to empty array when not set', async () => {
      const result = await McpAllowedOrigins.pipe(
        runWith({}),
        Effect.runPromise
      )
      expect(result).toEqual([])
    })

    it('should parse comma-separated origins', async () => {
      const result = await McpAllowedOrigins.pipe(
        runWith({
          MCP_ALLOWED_ORIGINS: 'http://localhost:3000, http://example.com',
        }),
        Effect.runPromise
      )
      expect(result).toEqual(['http://localhost:3000', 'http://example.com'])
    })
  })
})
