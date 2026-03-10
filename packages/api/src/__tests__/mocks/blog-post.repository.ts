import {
  type BlogPost,
  BlogPostRepository,
  type BlogPostStatus,
  type CreateBlogPostData,
  type IBlogPostRepository,
} from '@lily/api/repositories/blog-post.repository'
import type { BlogPostSource, LocalizedText } from '@lily/db/schema'
import { Array, Effect, Layer, Option, pipe } from 'effect'

export const createMockBlogPostRepository = (
  posts: BlogPost[]
): Layer.Layer<BlogPostRepository> => {
  const data = Array.map(posts, (p) => ({ ...p }))

  const repo: IBlogPostRepository = {
    create: (createData: CreateBlogPostData) =>
      Effect.succeed({
        id: `blog-${crypto.randomUUID()}`,
        slug: createData.slug,
        title: createData.title,
        category: createData.category,
        tags: createData.tags,
        status: 'pending' as const,
        sources: [],
        content: null,
        reviewScore: null,
        reviewFeedback: null,
        retryCount: 0,
        publishedAt: null,
        commitShas: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),

    findBySlug: (slug: string) =>
      Effect.succeed(
        pipe(
          Array.findFirst(data, (p) => p.slug === slug),
          Option.getOrNull
        )
      ),

    findById: (id: string) =>
      Effect.succeed(
        pipe(
          Array.findFirst(data, (p) => p.id === id),
          Option.getOrNull
        )
      ),

    findAllSlugs: () => Effect.succeed(Array.map(data, (p) => p.slug)),

    findRecentCategories: (limit: number) =>
      Effect.succeed(
        pipe(
          Array.filter(data, (p) => p.status === 'published'),
          Array.take(limit),
          Array.map((p) => p.category)
        )
      ),

    countPublishedSince: (since: Date) =>
      Effect.succeed(
        Array.filter(
          data,
          (p) =>
            p.status === 'published' &&
            p.publishedAt !== null &&
            p.publishedAt.getTime() >= since.getTime()
        ).length
      ),

    updateStatus: (id: string, status: BlogPostStatus) => {
      const idx = Array.findFirstIndex(data, (p) => p.id === id)
      if (Option.isNone(idx)) return Effect.succeed(null)
      const existing = data[idx.value]!
      const updated: BlogPost = { ...existing, status, updatedAt: new Date() }
      data[idx.value] = updated
      return Effect.succeed(updated)
    },

    updateSources: (id: string, sources: BlogPostSource[]) => {
      const idx = Array.findFirstIndex(data, (p) => p.id === id)
      if (Option.isNone(idx)) return Effect.succeed(null)
      const existing = data[idx.value]!
      const updated: BlogPost = { ...existing, sources, updatedAt: new Date() }
      data[idx.value] = updated
      return Effect.succeed(updated)
    },

    updateContent: (id: string, content: LocalizedText) => {
      const idx = Array.findFirstIndex(data, (p) => p.id === id)
      if (Option.isNone(idx)) return Effect.succeed(null)
      const existing = data[idx.value]!
      const updated: BlogPost = { ...existing, content, updatedAt: new Date() }
      data[idx.value] = updated
      return Effect.succeed(updated)
    },

    updateReview: (
      id: string,
      review: {
        reviewScore: number
        reviewFeedback: string
        retryCount: number
      }
    ) => {
      const idx = Array.findFirstIndex(data, (p) => p.id === id)
      if (Option.isNone(idx)) return Effect.succeed(null)
      const existing = data[idx.value]!
      const updated: BlogPost = {
        ...existing,
        ...review,
        updatedAt: new Date(),
      }
      data[idx.value] = updated
      return Effect.succeed(updated)
    },

    markPublished: (id: string, commitShas: LocalizedText) => {
      const idx = Array.findFirstIndex(data, (p) => p.id === id)
      if (Option.isNone(idx)) return Effect.succeed(null)
      const existing = data[idx.value]!
      const updated: BlogPost = {
        ...existing,
        commitShas,
        status: 'published' as const,
        publishedAt: new Date(),
        updatedAt: new Date(),
      }
      data[idx.value] = updated
      return Effect.succeed(updated)
    },
  }

  return Layer.succeed(BlogPostRepository, repo)
}
