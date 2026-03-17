import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import {
  type BlogPostSource,
  blogPosts,
  type LocalizedText,
} from '@lily/db/schema'
import type { blogPostStatusEnum } from '@lily/db/schema/enums'
import { nowAsDate } from '@lily/shared'
import { and, count, desc, eq, gte, inArray } from 'drizzle-orm'
import { Array, Context, Effect, Layer, Option, pipe } from 'effect'

export type BlogPostStatus = (typeof blogPostStatusEnum.enumValues)[number]

/** Non-terminal statuses indicating a post is actively being processed */
export const IN_PROGRESS_STATUSES: readonly BlogPostStatus[] = [
  'pending',
  'researching',
  'generating',
  'reviewing',
]

export type BlogPost = typeof blogPosts.$inferSelect

export interface CreateBlogPostData {
  slug: string
  title: LocalizedText
  category: string
  tags: string[]
}

export interface IBlogPostRepository {
  readonly create: (
    data: CreateBlogPostData
  ) => Effect.Effect<BlogPost | null, SqlError>
  readonly findBySlug: (
    slug: string
  ) => Effect.Effect<BlogPost | null, SqlError>
  readonly findById: (id: string) => Effect.Effect<BlogPost | null, SqlError>
  readonly findAllSlugs: () => Effect.Effect<string[], SqlError>
  readonly findRecentCategories: (
    limit: number
  ) => Effect.Effect<string[], SqlError>
  readonly countPublishedSince: (since: Date) => Effect.Effect<number, SqlError>
  readonly hasInProgress: () => Effect.Effect<boolean, SqlError>
  readonly findPublishedSlugsWithTitles: () => Effect.Effect<
    readonly { slug: string; title: LocalizedText }[],
    SqlError
  >
  readonly updateStatus: (
    id: string,
    status: BlogPostStatus
  ) => Effect.Effect<BlogPost | null, SqlError>
  readonly updateSources: (
    id: string,
    sources: BlogPostSource[]
  ) => Effect.Effect<BlogPost | null, SqlError>
  readonly updateContent: (
    id: string,
    content: LocalizedText
  ) => Effect.Effect<BlogPost | null, SqlError>
  readonly updateReview: (
    id: string,
    data: {
      reviewScore: number
      reviewFeedback: string
      retryCount: number
    }
  ) => Effect.Effect<BlogPost | null, SqlError>
  readonly markPublished: (
    id: string,
    commitShas: LocalizedText
  ) => Effect.Effect<BlogPost | null, SqlError>
}

export class BlogPostRepository extends Context.Tag('BlogPostRepository')<
  BlogPostRepository,
  IBlogPostRepository
>() {}

export const BlogPostRepositoryLive = Layer.effect(
  BlogPostRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    return {
      create: Effect.fn('BlogPostRepository.create')(function* (
        data: CreateBlogPostData
      ) {
        const [row] = yield* db.insert(blogPosts).values(data).returning()
        return Option.getOrNull(Option.fromNullable(row))
      }),

      findBySlug: Effect.fn('BlogPostRepository.findBySlug')(function* (
        slug: string
      ) {
        const [row] = yield* db
          .select()
          .from(blogPosts)
          .where(eq(blogPosts.slug, slug))
        return Option.getOrNull(Option.fromNullable(row))
      }),

      findById: Effect.fn('BlogPostRepository.findById')(function* (
        id: string
      ) {
        const [row] = yield* db
          .select()
          .from(blogPosts)
          .where(eq(blogPosts.id, id))
        return Option.getOrNull(Option.fromNullable(row))
      }),

      findAllSlugs: Effect.fn('BlogPostRepository.findAllSlugs')(function* () {
        const rows = yield* db.select({ slug: blogPosts.slug }).from(blogPosts)
        return Array.map(rows, (r) => r.slug)
      }),

      findRecentCategories: Effect.fn(
        'BlogPostRepository.findRecentCategories'
      )(function* (limit: number) {
        const rows = yield* db
          .select({ category: blogPosts.category })
          .from(blogPosts)
          .where(eq(blogPosts.status, 'published'))
          .orderBy(desc(blogPosts.publishedAt))
          .limit(limit)
        return Array.map(rows, (r) => r.category)
      }),

      findPublishedSlugsWithTitles: Effect.fn(
        'BlogPostRepository.findPublishedSlugsWithTitles'
      )(function* () {
        const rows = yield* db
          .select({ slug: blogPosts.slug, title: blogPosts.title })
          .from(blogPosts)
          .where(eq(blogPosts.status, 'published'))
          .orderBy(desc(blogPosts.publishedAt))
        return rows as readonly { slug: string; title: LocalizedText }[]
      }),

      hasInProgress: Effect.fn('BlogPostRepository.hasInProgress')(
        function* () {
          const [result] = yield* db
            .select({ value: count() })
            .from(blogPosts)
            .where(inArray(blogPosts.status, [...IN_PROGRESS_STATUSES]))
          return pipe(
            Option.fromNullable(result),
            Option.flatMap((r) => Option.fromNullable(r.value)),
            Option.getOrElse(() => 0),
            (n) => n > 0
          )
        }
      ),

      countPublishedSince: Effect.fn('BlogPostRepository.countPublishedSince')(
        function* (since: Date) {
          const [result] = yield* db
            .select({ value: count() })
            .from(blogPosts)
            .where(
              and(
                eq(blogPosts.status, 'published'),
                gte(blogPosts.publishedAt, since)
              )
            )
          return pipe(
            Option.fromNullable(result),
            Option.flatMap((r) => Option.fromNullable(r.value)),
            Option.getOrElse(() => 0)
          )
        }
      ),

      updateStatus: Effect.fn('BlogPostRepository.updateStatus')(function* (
        id: string,
        status: BlogPostStatus
      ) {
        const [row] = yield* db
          .update(blogPosts)
          .set({ status })
          .where(eq(blogPosts.id, id))
          .returning()
        return Option.getOrNull(Option.fromNullable(row))
      }),

      updateSources: Effect.fn('BlogPostRepository.updateSources')(function* (
        id: string,
        sources: BlogPostSource[]
      ) {
        const [row] = yield* db
          .update(blogPosts)
          .set({ sources })
          .where(eq(blogPosts.id, id))
          .returning()
        return Option.getOrNull(Option.fromNullable(row))
      }),

      updateContent: Effect.fn('BlogPostRepository.updateContent')(function* (
        id: string,
        content: LocalizedText
      ) {
        const [row] = yield* db
          .update(blogPosts)
          .set({ content })
          .where(eq(blogPosts.id, id))
          .returning()
        return Option.getOrNull(Option.fromNullable(row))
      }),

      updateReview: Effect.fn('BlogPostRepository.updateReview')(function* (
        id: string,
        data: {
          reviewScore: number
          reviewFeedback: string
          retryCount: number
        }
      ) {
        const [row] = yield* db
          .update(blogPosts)
          .set(data)
          .where(eq(blogPosts.id, id))
          .returning()
        return Option.getOrNull(Option.fromNullable(row))
      }),

      markPublished: Effect.fn('BlogPostRepository.markPublished')(function* (
        id: string,
        commitShas: LocalizedText
      ) {
        const [row] = yield* db
          .update(blogPosts)
          .set({
            commitShas,
            status: 'published' as const,
            publishedAt: nowAsDate(),
          })
          .where(eq(blogPosts.id, id))
          .returning()
        return Option.getOrNull(Option.fromNullable(row))
      }),
    }
  })
)
