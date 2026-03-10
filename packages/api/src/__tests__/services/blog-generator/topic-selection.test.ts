import {
  mockBlogPost1,
  mockBlogPost2,
  mockBlogPosts,
} from '@lily/api/__tests__/fixtures/blog-posts'
import { createMockBlogPostRepository } from '@lily/api/__tests__/mocks/blog-post.repository'
import { BlogPostRepository } from '@lily/api/repositories/blog-post.repository'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('topic selection dedup', () => {
  it('should return all existing slugs for dedup', async () => {
    const mockRepo = createMockBlogPostRepository(mockBlogPosts)

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* BlogPostRepository
        return yield* repo.findAllSlugs()
      }).pipe(Effect.provide(mockRepo))
    )

    expect(result).toContain('how-to-water-succulents')
    expect(result).toContain('indoor-plants-low-light')
    expect(result).toContain('propagation-basics')
    expect(result).toContain('pest-control-guide')
    expect(result).toHaveLength(4)
  })

  it('should return recent categories from published posts only', async () => {
    const mockRepo = createMockBlogPostRepository(mockBlogPosts)

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* BlogPostRepository
        return yield* repo.findRecentCategories(10)
      }).pipe(Effect.provide(mockRepo))
    )

    // Only published posts should appear
    expect(result).toContain('care-guide')
    expect(result).toContain('plant-profile')
    // Pending and rejected should not
    expect(result).not.toContain('how-to')
    expect(result).not.toContain('troubleshooting')
  })

  it('should count published posts since a given date', async () => {
    const mockRepo = createMockBlogPostRepository(mockBlogPosts)

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* BlogPostRepository
        // Count posts published since March 6
        return yield* repo.countPublishedSince(new Date('2026-03-06T00:00:00Z'))
      }).pipe(Effect.provide(mockRepo))
    )

    // Only mockBlogPost2 (published March 7) qualifies
    expect(result).toBe(1)
  })

  it('should return 0 when no posts published in range', async () => {
    const mockRepo = createMockBlogPostRepository(mockBlogPosts)

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* BlogPostRepository
        return yield* repo.countPublishedSince(new Date('2026-03-11T00:00:00Z'))
      }).pipe(Effect.provide(mockRepo))
    )

    expect(result).toBe(0)
  })
})
