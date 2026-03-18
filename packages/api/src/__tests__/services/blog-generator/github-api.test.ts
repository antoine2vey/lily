import { publishBlogPost } from '@lily/api/services/blog-generator/github'
import { ConfigProvider, Effect, Layer } from 'effect'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock octokit — vi.hoisted ensures fns are available when vi.mock is hoisted
const {
  mockGetRef,
  mockGetCommit,
  mockCreateBlob,
  mockCreateTree,
  mockCreateCommit,
  mockUpdateRef,
} = vi.hoisted(() => ({
  mockGetRef: vi.fn(),
  mockGetCommit: vi.fn(),
  mockCreateBlob: vi.fn(),
  mockCreateTree: vi.fn(),
  mockCreateCommit: vi.fn(),
  mockUpdateRef: vi.fn(),
}))

vi.mock('octokit', () => ({
  Octokit: vi.fn().mockImplementation(() => ({
    rest: {
      git: {
        getRef: mockGetRef,
        getCommit: mockGetCommit,
        createBlob: mockCreateBlob,
        createTree: mockCreateTree,
        createCommit: mockCreateCommit,
        updateRef: mockUpdateRef,
      },
    },
  })),
}))

describe('GitHub API — publishBlogPost', () => {
  const mockConfig = ConfigProvider.fromMap(
    new Map([
      ['GITHUB_TOKEN', 'test-token'],
      ['GITHUB_REPO', 'owner/repo'],
      ['GITHUB_BRANCH', 'main'],
    ])
  )

  beforeEach(() => {
    vi.clearAllMocks()

    mockGetRef.mockResolvedValue({
      data: { object: { sha: 'head-sha-1' } },
    })
    mockGetCommit.mockResolvedValue({
      data: { tree: { sha: 'tree-sha-1' } },
    })
    mockCreateBlob.mockResolvedValue({
      data: { sha: 'blob-sha' },
    })
    mockCreateTree.mockResolvedValue({
      data: { sha: 'new-tree-sha' },
    })
    mockCreateCommit.mockResolvedValue({
      data: { sha: 'new-commit-sha' },
    })
    mockUpdateRef.mockResolvedValue({
      data: { ref: 'heads/main', object: { sha: 'new-commit-sha' } },
    })
  })

  it('should commit all files and push directly to main', async () => {
    const result = await Effect.runPromise(
      publishBlogPost('test-post', { en: '# English', fr: '# French' }).pipe(
        Effect.provide(Layer.setConfigProvider(mockConfig))
      )
    )

    // All locales should have the commit SHA
    expect(result.en).toBe('new-commit-sha')
    expect(result.fr).toBe('new-commit-sha')

    // Verify base branch was fast-forwarded (no branch/PR created)
    expect(mockUpdateRef).toHaveBeenCalledWith(
      expect.objectContaining({
        ref: 'heads/main',
        sha: 'new-commit-sha',
      })
    )

    // Verify tree was created with both locale files
    expect(mockCreateTree).toHaveBeenCalledWith(
      expect.objectContaining({
        base_tree: 'tree-sha-1',
        tree: expect.arrayContaining([
          expect.objectContaining({
            path: 'packages/web/content/posts/en/test-post.mdx',
          }),
          expect.objectContaining({
            path: 'packages/web/content/posts/fr/test-post.mdx',
          }),
        ]),
      })
    )
  })

  it('should fail when branch ref cannot be fetched', async () => {
    mockGetRef.mockRejectedValueOnce(new Error('Not found'))

    const result = await Effect.runPromiseExit(
      publishBlogPost('test-post', { en: '# Content' }).pipe(
        Effect.provide(Layer.setConfigProvider(mockConfig))
      )
    )

    expect(result._tag).toBe('Failure')
  })
})
