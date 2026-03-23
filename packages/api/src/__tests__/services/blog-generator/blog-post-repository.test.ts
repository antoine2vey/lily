import {
  mockBlogPosts,
  mockPendingBlogPost,
} from '@lily/api/__tests__/fixtures/blog-posts'
import { createMockBlogPostRepository } from '@lily/api/__tests__/mocks/blog-post.repository'
import { BlogPostRepository } from '@lily/api/repositories/blog-post.repository'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

describe('BlogPostRepository', () => {
  describe('create', () => {
    it('should create a new blog post with pending status', async () => {
      const mockRepo = createMockBlogPostRepository([])

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* BlogPostRepository
          return yield* repo.create({
            slug: 'new-post',
            title: { en: 'New Post', fr: 'Nouveau post' },
            category: 'care-guide',
            tags: ['test'],
          })
        }).pipe(Effect.provide(mockRepo))
      )

      expect(result).not.toBeNull()
      expect(result?.slug).toBe('new-post')
      expect(result?.status).toBe('pending')
      expect(result?.retryCount).toBe(0)
      expect(result?.content).toBeNull()
    })
  })

  describe('findBySlug', () => {
    it('should find a post by slug', async () => {
      const mockRepo = createMockBlogPostRepository(mockBlogPosts)

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* BlogPostRepository
          return yield* repo.findBySlug('how-to-water-succulents')
        }).pipe(Effect.provide(mockRepo))
      )

      expect(result).not.toBeNull()
      expect(result?.id).toBe('blog-1')
    })

    it('should return null for unknown slug', async () => {
      const mockRepo = createMockBlogPostRepository(mockBlogPosts)

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* BlogPostRepository
          return yield* repo.findBySlug('does-not-exist')
        }).pipe(Effect.provide(mockRepo))
      )

      expect(result).toBeNull()
    })
  })

  describe('updateStatus', () => {
    it('should update post status', async () => {
      const mockRepo = createMockBlogPostRepository(mockBlogPosts)

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* BlogPostRepository
          return yield* repo.updateStatus(mockPendingBlogPost.id, 'researching')
        }).pipe(Effect.provide(mockRepo))
      )

      expect(result).not.toBeNull()
      expect(result?.status).toBe('researching')
    })
  })

  describe('updateContent', () => {
    it('should update post content', async () => {
      const mockRepo = createMockBlogPostRepository(mockBlogPosts)

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* BlogPostRepository
          return yield* repo.updateContent(mockPendingBlogPost.id, {
            en: '# English Content',
            fr: '# Contenu Français',
          })
        }).pipe(Effect.provide(mockRepo))
      )

      expect(result).not.toBeNull()
      expect(result?.content?.en).toBe('# English Content')
      expect(result?.content?.fr).toBe('# Contenu Français')
    })
  })

  describe('markPublished', () => {
    it('should mark post as published with commit SHAs', async () => {
      const mockRepo = createMockBlogPostRepository(mockBlogPosts)

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* BlogPostRepository
          return yield* repo.markPublished(mockPendingBlogPost.id, {
            en: 'sha-en-123',
            fr: 'sha-fr-456',
          })
        }).pipe(Effect.provide(mockRepo))
      )

      expect(result).not.toBeNull()
      expect(result?.status).toBe('published')
      expect(result?.commitShas?.en).toBe('sha-en-123')
      expect(result?.commitShas?.fr).toBe('sha-fr-456')
      expect(result?.publishedAt).toBeDefined()
    })
  })

  describe('updateReview', () => {
    it('should update review data', async () => {
      const mockRepo = createMockBlogPostRepository(mockBlogPosts)

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* BlogPostRepository
          return yield* repo.updateReview(mockPendingBlogPost.id, {
            reviewScore: 85,
            reviewFeedback: 'Needs more original phrasing',
          })
        }).pipe(Effect.provide(mockRepo))
      )

      expect(result).not.toBeNull()
      expect(result?.reviewScore).toBe(85)
      expect(result?.reviewFeedback).toBe('Needs more original phrasing')
    })
  })
})
