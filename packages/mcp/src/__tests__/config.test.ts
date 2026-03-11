import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('MCP config', () => {
  const originalEnv = process.env

  beforeEach(() => {
    // Reset module cache so each test re-evaluates config.ts
    vi.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('MCP_PORT', () => {
    it('should default to 3001 when not set', async () => {
      delete process.env.MCP_PORT
      const { MCP_PORT } = await import('@lily/mcp/config')
      expect(MCP_PORT).toBe(3001)
    })

    it('should use env value when set', async () => {
      process.env.MCP_PORT = '4000'
      const { MCP_PORT } = await import('@lily/mcp/config')
      expect(MCP_PORT).toBe(4000)
    })
  })

  describe('MCP_SERVER_URL', () => {
    it('should default to localhost with port', async () => {
      delete process.env.MCP_SERVER_URL
      delete process.env.MCP_PORT
      const { MCP_SERVER_URL } = await import('@lily/mcp/config')
      expect(MCP_SERVER_URL).toBe('http://localhost:3001')
    })

    it('should use env value when set', async () => {
      process.env.MCP_SERVER_URL = 'https://mcp.example.com'
      const { MCP_SERVER_URL } = await import('@lily/mcp/config')
      expect(MCP_SERVER_URL).toBe('https://mcp.example.com')
    })

    it('should strip trailing slash', async () => {
      process.env.MCP_SERVER_URL = 'https://mcp.example.com/'
      const { MCP_SERVER_URL } = await import('@lily/mcp/config')
      expect(MCP_SERVER_URL).toBe('https://mcp.example.com')
    })
  })
})
