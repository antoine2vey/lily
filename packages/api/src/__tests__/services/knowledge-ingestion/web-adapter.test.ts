import { lookup } from 'node:dns/promises'
import { webAdapter } from '@lily/api/services/knowledge-ingestion/adapters/web.adapter'
import type { WebAdapterConfig } from '@lily/shared/knowledge'
import { Array, Effect, Stream } from 'effect'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The SSRF guard resolves each hostname via DNS before fetching. Stub it so
// these unit tests stay hermetic (no live DNS): every hostname "resolves" to a
// public address and therefore passes the guard. The resolved value is set in
// beforeEach so it survives the afterEach mock reset. Dedicated allow/block
// coverage for the guard itself lives in ssrf-guard.test.ts.
vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }))
// `lookup` is overloaded (single LookupAddress vs LookupAddress[] for { all: true }),
// so treat the mock as a generic vi.fn to set an array resolved value freely.
const mockLookup = lookup as unknown as ReturnType<typeof vi.fn>

const makeHtml = (title: string, body: string) => `
<!DOCTYPE html>
<html>
<head><title>${title}</title></head>
<body>
  <nav>Navigation bar</nav>
  <article>
    <h1>${title}</h1>
    <p>${body}</p>
  </article>
  <footer>Footer content</footer>
</body>
</html>
`

const makeLongBody = (length: number) =>
  'This is a detailed care guide about monstera deliciosa covering watering light and soil. '.repeat(
    Math.ceil(length / 90)
  )

const makeConfig = (urls: string[]): WebAdapterConfig => ({
  type: 'web',
  urls,
})

const mockFetch = (impl: () => Promise<Response>) => {
  const fn = vi.fn().mockImplementation(impl) as unknown as typeof fetch
  globalThis.fetch = fn
}

const originalFetch = globalThis.fetch

beforeEach(() => {
  mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
})

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

const collectDocs = (config: WebAdapterConfig) =>
  Effect.runPromise(
    Stream.runCollect(webAdapter.fetch(config)).pipe(
      Effect.map((chunk) => Array.fromIterable(chunk))
    )
  )

describe('webAdapter', () => {
  it('returns correct RawDocumentInput for a successful fetch', async () => {
    const body = makeLongBody(300)
    const html = makeHtml('Monstera Care Guide', body)

    mockFetch(() =>
      Promise.resolve(
        new Response(html, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        })
      )
    )

    const config = makeConfig(['https://example.com/monstera-care'])
    const docs = await collectDocs(config)

    expect(docs).toHaveLength(1)
    expect(docs[0]?.source).toBe('web')
    expect(docs[0]?.sourceUrl).toBe('https://example.com/monstera-care')
    expect(docs[0]?.sourceId).toMatch(/^web_/)
    expect(docs[0]?.title).toBeTruthy()
    expect(docs[0]?.content.length).toBeGreaterThanOrEqual(200)
    expect(docs[0]?.metadata).toHaveProperty('domain', 'example.com')
    expect(docs[0]?.metadata).toHaveProperty('contentLength')
    expect(docs[0]?.metadata).toHaveProperty('fetchedAt')
  })

  it('generates deterministic sourceId for the same URL', async () => {
    const body = makeLongBody(300)
    const html = makeHtml('Test Page', body)

    mockFetch(() => Promise.resolve(new Response(html, { status: 200 })))

    const url = 'https://example.com/test-page'
    const config = makeConfig([url])

    const docs1 = await collectDocs(config)
    const docs2 = await collectDocs(config)

    expect(docs1[0]?.sourceId).toBe(docs2[0]?.sourceId)
  })

  it('skips pages that return non-200 status', async () => {
    mockFetch(() =>
      Promise.resolve(
        new Response('Not Found', { status: 404, statusText: 'Not Found' })
      )
    )

    const config = makeConfig(['https://example.com/missing-page'])
    const docs = await collectDocs(config)

    expect(docs).toHaveLength(0)
  })

  it('skips pages with content too short', async () => {
    const html = makeHtml('Short', 'Too short content.')

    mockFetch(() => Promise.resolve(new Response(html, { status: 200 })))

    const config = makeConfig(['https://example.com/short-page'])
    const docs = await collectDocs(config)

    expect(docs).toHaveLength(0)
  })

  it('continues processing remaining URLs when one fails', async () => {
    const body = makeLongBody(300)
    const html = makeHtml('Good Page', body)

    let callCount = 0
    const fn = vi.fn().mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return Promise.resolve(
          new Response('Not Found', { status: 404, statusText: 'Not Found' })
        )
      }
      return Promise.resolve(new Response(html, { status: 200 }))
    }) as unknown as typeof fetch
    globalThis.fetch = fn

    const config = makeConfig([
      'https://example.com/broken',
      'https://example.com/working',
    ])

    const docs = await collectDocs(config)

    expect(docs).toHaveLength(1)
    expect(docs[0]?.sourceUrl).toBe('https://example.com/working')
  })

  it('fails with AdapterError for wrong config type', async () => {
    const invalidConfig = { type: 'reddit', subreddits: ['test'] } as never

    const result = await Effect.runPromise(
      Stream.runCollect(webAdapter.fetch(invalidConfig)).pipe(Effect.either)
    )

    expect(result._tag).toBe('Left')
  })

  it('sanitizes content text from UTF-8 issues', async () => {
    const body = makeLongBody(300)
    const htmlWithBadChars = makeHtml(
      'Sanitize Test',
      `${body} \u0000 \uFFFE some normal text`
    )

    mockFetch(() =>
      Promise.resolve(new Response(htmlWithBadChars, { status: 200 }))
    )

    const config = makeConfig(['https://example.com/sanitize-test'])
    const docs = await collectDocs(config)

    expect(docs).toHaveLength(1)
    expect(docs[0]?.content).not.toContain('\u0000')
    expect(docs[0]?.content).not.toContain('\uFFFE')
  })
})
