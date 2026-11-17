import { beforeEach, expect, vi } from 'vitest'

// Both vitest configs load this file, so the integration shards fail on Node too
expect(
  process.versions.bun,
  'the api tests run on Bun, the runtime production runs on (bun --bun vitest run)'
).toBeDefined()

beforeEach(() => {
  vi.clearAllMocks()
})
