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
      create: (data: CreateBlogPostData) =>
        Effect.gen(function* () {
          const [row] = yield* db.insert(blogPosts).values(data).returning()
          return Option.getOrNull(Option.fromNullable(row))
        }).pipe(Effect.withSpan('BlogPostRepository.create')),

      findBySlug: (slug: string) =>
        Effect.gen(function* () {
          const [row] = yield* db
            .select()
            .from(blogPosts)
            .where(eq(blogPosts.slug, slug))
          return Option.getOrNull(Option.fromNullable(row))
        }).pipe(Effect.withSpan('BlogPostRepository.findBySlug')),

      findById: (id: string) =>
        Effect.gen(function* () {
          const [row] = yield* db
            .select()
            .from(blogPosts)
            .where(eq(blogPosts.id, id))
          return Option.getOrNull(Option.fromNullable(row))
        }).pipe(Effect.withSpan('BlogPostRepository.findById')),

      findAllSlugs: () =>
        Effect.gen(function* () {
          const rows = yield* db
            .select({ slug: blogPosts.slug })
            .from(blogPosts)
          return Array.map(rows, (r) => r.slug)
        }).pipe(Effect.withSpan('BlogPostRepository.findAllSlugs')),

      findRecentCategories: (limit: number) =>
        Effect.gen(function* () {
          const rows = yield* db
            .select({ category: blogPosts.category })
            .from(blogPosts)
            .where(eq(blogPosts.status, 'published'))
            .orderBy(desc(blogPosts.publishedAt))
            .limit(limit)
          return Array.map(rows, (r) => r.category)
        }).pipe(Effect.withSpan('BlogPostRepository.findRecentCategories')),

      findPublishedSlugsWithTitles: () =>
        Effect.gen(function* () {
          const rows = yield* db
            .select({ slug: blogPosts.slug, title: blogPosts.title })
            .from(blogPosts)
            .where(eq(blogPosts.status, 'published'))
            .orderBy(desc(blogPosts.publishedAt))
          return rows as readonly { slug: string; title: LocalizedText }[]
        }).pipe(
          Effect.withSpan('BlogPostRepository.findPublishedSlugsWithTitles')
        ),

      hasInProgress: () =>
        Effect.gen(function* () {
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
        }).pipe(Effect.withSpan('BlogPostRepository.hasInProgress')),

      countPublishedSince: (since: Date) =>
        Effect.gen(function* () {
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
        }).pipe(Effect.withSpan('BlogPostRepository.countPublishedSince')),

      updateStatus: (id: string, status: BlogPostStatus) =>
        Effect.gen(function* () {
          const [row] = yield* db
            .update(blogPosts)
            .set({ status })
            .where(eq(blogPosts.id, id))
            .returning()
          return Option.getOrNull(Option.fromNullable(row))
        }).pipe(Effect.withSpan('BlogPostRepository.updateStatus')),

      updateSources: (id: string, sources: BlogPostSource[]) =>
        Effect.gen(function* () {
          const [row] = yield* db
            .update(blogPosts)
            .set({ sources })
            .where(eq(blogPosts.id, id))
            .returning()
          return Option.getOrNull(Option.fromNullable(row))
        }).pipe(Effect.withSpan('BlogPostRepository.updateSources')),

      updateContent: (id: string, content: LocalizedText) =>
        Effect.gen(function* () {
          const [row] = yield* db
            .update(blogPosts)
            .set({ content })
            .where(eq(blogPosts.id, id))
            .returning()
          return Option.getOrNull(Option.fromNullable(row))
        }).pipe(Effect.withSpan('BlogPostRepository.updateContent')),

      updateReview: (
        id: string,
        data: {
          reviewScore: number
          reviewFeedback: string
          retryCount: number
        }
      ) =>
        Effect.gen(function* () {
          const [row] = yield* db
            .update(blogPosts)
            .set(data)
            .where(eq(blogPosts.id, id))
            .returning()
          return Option.getOrNull(Option.fromNullable(row))
        }).pipe(Effect.withSpan('BlogPostRepository.updateReview')),

      markPublished: (id: string, commitShas: LocalizedText) =>
        Effect.gen(function* () {
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
        }).pipe(Effect.withSpan('BlogPostRepository.markPublished')),
    }
  })
)
