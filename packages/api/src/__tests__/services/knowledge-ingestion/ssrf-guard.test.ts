import { lookup } from 'node:dns/promises'
import { assertPublicUrl } from '@lily/api/services/knowledge-ingestion/adapters/ssrf-guard'
import { Effect, Exit } from 'effect'
import { afterEach, describe, expect, it, vi } from 'vitest'

// DNS is the only network dependency of the guard; stub it so tests are hermetic.
vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }))
// `lookup` is overloaded (single LookupAddress vs LookupAddress[] for { all: true }),
// so treat the mock as a generic vi.fn to set an array resolved value freely.
const mockLookup = lookup as unknown as ReturnType<typeof vi.fn>

const run = (url: string) => Effect.runPromiseExit(assertPublicUrl(url, 'web'))

afterEach(() => {
  vi.clearAllMocks()
})

describe('assertPublicUrl (SSRF guard)', () => {
  it.each([
    'http://localhost/x',
    'http://foo.local/x',
    'http://service.internal/x',
    'http://127.0.0.1/x',
    'http://169.254.169.254/latest/meta-data/', // cloud metadata endpoint
    'http://10.0.0.1/x',
    'http://172.16.5.4/x',
    'http://192.168.1.1/x',
    'http://[::1]/x',
  ])('blocks internal/private target %s (no DNS needed)', async (url) => {
    const exit = await run(url)
    expect(Exit.isFailure(exit)).toBe(true)
  })

  it('blocks non-HTTP(S) URL schemes', async () => {
    const exit = await run('ftp://example.com/x')
    expect(Exit.isFailure(exit)).toBe(true)
  })

  it('blocks a public hostname that resolves to a private IP', async () => {
    mockLookup.mockResolvedValueOnce([
      { address: '169.254.169.254', family: 4 },
    ])
    const exit = await run('http://sneaky.example.com/x')
    expect(Exit.isFailure(exit)).toBe(true)
  })

  it('allows a hostname that resolves to a public IP', async () => {
    mockLookup.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }])
    const exit = await run('https://example.com/article')
    expect(Exit.isSuccess(exit)).toBe(true)
  })

  it('allows a public IP literal without performing DNS resolution', async () => {
    const exit = await run('https://8.8.8.8/x')
    expect(Exit.isSuccess(exit)).toBe(true)
    expect(mockLookup).not.toHaveBeenCalled()
  })
})
