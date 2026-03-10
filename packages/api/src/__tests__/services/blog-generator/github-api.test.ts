import { commitFileToGitHub } from '@lily/api/services/blog-generator/github'
import { ConfigProvider, Effect, Layer } from 'effect'
import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('GitHub API integration', () => {
  const mockConfig = ConfigProvider.fromMap(
    new Map([
      ['GITHUB_TOKEN', 'test-token'],
      ['GITHUB_REPO', 'owner/repo'],
    ])
  )

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('should commit a new file successfully', async () => {
    const mockFetch = vi.fn()
    // First call: check if file exists (404 = new file)
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    })
    // Second call: create file
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          content: {
            sha: 'new-sha-123',
            path: 'packages/web/content/posts/en/test.mdx',
          },
        }),
    })

    vi.stubGlobal('fetch', mockFetch)

    const result = await Effect.runPromise(
      commitFileToGitHub({
        path: 'packages/web/content/posts/en/test.mdx',
        content: '# Test Content',
        message: 'blog: add test post',
      }).pipe(Effect.provide(Layer.setConfigProvider(mockConfig)))
    )

    expect(result.sha).toBe('new-sha-123')
    expect(result.path).toBe('packages/web/content/posts/en/test.mdx')

    // Verify the PUT request was made with correct params
    expect(mockFetch).toHaveBeenCalledTimes(2)
    const putCall = mockFetch.mock.calls[1]!
    expect(putCall[0]).toContain('/repos/owner/repo/contents/')
    expect(putCall[1]!.method).toBe('PUT')

    const body = JSON.parse(putCall[1]!.body as string)
    expect(body.message).toBe('blog: add test post')
    expect(body.content).toBe(Buffer.from('# Test Content').toString('base64'))
    // No sha for new file
    expect(body.sha).toBeUndefined()
  })

  it('should update an existing file with its sha', async () => {
    const mockFetch = vi.fn()
    // First call: file exists
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ sha: 'existing-sha-456' }),
    })
    // Second call: update file
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          content: {
            sha: 'updated-sha-789',
            path: 'packages/web/content/posts/en/test.mdx',
          },
        }),
    })

    vi.stubGlobal('fetch', mockFetch)

    const result = await Effect.runPromise(
      commitFileToGitHub({
        path: 'packages/web/content/posts/en/test.mdx',
        content: '# Updated Content',
        message: 'blog: update test post',
      }).pipe(Effect.provide(Layer.setConfigProvider(mockConfig)))
    )

    expect(result.sha).toBe('updated-sha-789')

    // Verify sha was included in PUT body
    const putCall = mockFetch.mock.calls[1]!
    const body = JSON.parse(putCall[1]!.body as string)
    expect(body.sha).toBe('existing-sha-456')
  })

  it('should fail when GitHub API returns an error', async () => {
    const mockFetch = vi.fn()
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    })
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      text: () => Promise.resolve('Validation error'),
    })

    vi.stubGlobal('fetch', mockFetch)

    const result = await Effect.runPromiseExit(
      commitFileToGitHub({
        path: 'packages/web/content/posts/en/test.mdx',
        content: '# Content',
        message: 'blog: add post',
      }).pipe(Effect.provide(Layer.setConfigProvider(mockConfig)))
    )

    expect(result._tag).toBe('Failure')
  })
})
