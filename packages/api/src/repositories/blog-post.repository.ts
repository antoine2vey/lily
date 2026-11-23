import {
  type Transition,
  transition,
  transitionEach,
} from '@lily/api/kernel/transition'
import * as PgDrizzle from '@lily/db/effect-drizzle'
import {
  type BlogPostSource,
  blogPosts,
  type LocalizedText,
} from '@lily/db/schema'
import type { blogPostStatusEnum } from '@lily/db/schema/enums'
import { nowAsDate } from '@lily/shared'
import { and, count, desc, eq, gte, inArray, lte } from 'drizzle-orm'
import { Array, Context, Effect, Layer, Option, pipe } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export type BlogPostStatus = (typeof blogPostStatusEnum.enumValues)[number]

/** Non-terminal statuses indicating a post is actively being processed */
export const IN_PROGRESS_STATUSES = [
  'pending',
  'researching',
  'generating',
  'reviewing',
] as const satisfies ReadonlyArray<BlogPostStatus>

/** The states a pipeline moves its post to, each from the step before it. */
export type BlogPostStep = 'researching' | 'generating' | 'reviewing'

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
  readonly findAllSlugs: Effect.Effect<string[], SqlError>
  readonly findRecentCategories: (
    limit: number
  ) => Effect.Effect<string[], SqlError>
  readonly countPublishedSince: (since: Date) => Effect.Effect<number, SqlError>
  readonly rejectStalePosts: (
    staleBeforeDate: Date
  ) => Effect.Effect<number, SqlError>
  readonly hasInProgress: Effect.Effect<boolean, SqlError>
  readonly findPublishedSlugsWithTitles: Effect.Effect<
    readonly { slug: string; title: LocalizedText }[],
    SqlError
  >
  /**
   * `LostRace` says the post is not at the step before `to`: the stale
   * sweep rejected it, so its pipeline must stop.
   */
  readonly moveTo: (
    id: string,
    to: BlogPostStep
  ) => Effect.Effect<Transition<BlogPost>, SqlError>
  /** Rejects a post still in progress. A published post stays published. */
  readonly reject: (id: string) => Effect.Effect<Transition<BlogPost>, SqlError>
  readonly updateSources: (
    id: string,
    sources: BlogPostSource[]
  ) => Effect.Effect<BlogPost | null, SqlError>
  readonly updateContent: (
    id: string,
    content: LocalizedText
  ) => Effect.Effect<BlogPost | null, SqlError>
  readonly updateRetryCount: (
    id: string,
    retryCount: number
  ) => Effect.Effect<BlogPost | null, SqlError>
  readonly updateReview: (
    id: string,
    data: {
      reviewScore: number
      reviewFeedback: string
    }
  ) => Effect.Effect<BlogPost | null, SqlError>
  readonly markPublished: (
    id: string,
    commitShas: LocalizedText
  ) => Effect.Effect<Transition<BlogPost>, SqlError>
}

export class BlogPostRepository extends Context.Service<
  BlogPostRepository,
  IBlogPostRepository
>()('BlogPostRepository') {}

export const BlogPostRepositoryLive = Layer.effect(
  BlogPostRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    const step = {
      researching: (id) =>
        transition(db, 'BlogPost', id, {
          from: ['pending'],
          to: 'researching',
        }),
      generating: (id) =>
        transition(db, 'BlogPost', id, {
          from: ['researching', 'reviewing'],
          to: 'generating',
        }),
      reviewing: (id) =>
        transition(db, 'BlogPost', id, {
          from: ['generating'],
          to: 'reviewing',
        }),
    } satisfies Record<
      BlogPostStep,
      (id: string) => Effect.Effect<Transition<BlogPost>, SqlError>
    >

    return {
      create: Effect.fn('BlogPostRepository.create')(function* (
        data: CreateBlogPostData
      ) {
        // onConflictDoNothing on the unique `slug` column makes the insert a
        // no-op (returning an empty result set) when the LLM reuses a slug,
        // instead of throwing a unique-violation SqlError. Callers treat a
        // null return as "slug already taken" and handle the retry.
        const [row] = yield* db
          .insert(blogPosts)
          .values(data)
          .onConflictDoNothing({ target: blogPosts.slug })
          .returning()
        return Option.getOrNull(Option.fromNullishOr(row))
      }),

      findBySlug: Effect.fn('BlogPostRepository.findBySlug')(function* (
        slug: string
      ) {
        const [row] = yield* db
          .select()
          .from(blogPosts)
          .where(eq(blogPosts.slug, slug))
        return Option.getOrNull(Option.fromNullishOr(row))
      }),

      findById: Effect.fn('BlogPostRepository.findById')(function* (
        id: string
      ) {
        const [row] = yield* db
          .select()
          .from(blogPosts)
          .where(eq(blogPosts.id, id))
        return Option.getOrNull(Option.fromNullishOr(row))
      }),

      findAllSlugs: Effect.gen(function* () {
        const rows = yield* db.select({ slug: blogPosts.slug }).from(blogPosts)
        return Array.map(rows, (r) => r.slug)
      }).pipe(Effect.withSpan('BlogPostRepository.findAllSlugs')),

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

      findPublishedSlugsWithTitles: Effect.gen(function* () {
        const rows = yield* db
          .select({ slug: blogPosts.slug, title: blogPosts.title })
          .from(blogPosts)
          .where(eq(blogPosts.status, 'published'))
          .orderBy(desc(blogPosts.publishedAt))
        return rows as readonly { slug: string; title: LocalizedText }[]
      }).pipe(
        Effect.withSpan('BlogPostRepository.findPublishedSlugsWithTitles')
      ),

      hasInProgress: Effect.gen(function* () {
        const [result] = yield* db
          .select({ value: count() })
          .from(blogPosts)
          .where(inArray(blogPosts.status, [...IN_PROGRESS_STATUSES]))
        return pipe(
          Option.fromNullishOr(result),
          Option.flatMap((r) => Option.fromNullishOr(r.value)),
          Option.getOrElse(() => 0),
          (n) => n > 0
        )
      }).pipe(Effect.withSpan('BlogPostRepository.hasInProgress')),

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
            Option.fromNullishOr(result),
            Option.flatMap((r) => Option.fromNullishOr(r.value)),
            Option.getOrElse(() => 0)
          )
        }
      ),

      rejectStalePosts: Effect.fn('BlogPostRepository.rejectStalePosts')(
        function* (staleBeforeDate: Date) {
          const rows = yield* transitionEach(db, 'BlogPost', {
            from: IN_PROGRESS_STATUSES,
            to: 'rejected',
            where: lte(blogPosts.updatedAt, staleBeforeDate),
          })
          return Array.length(rows)
        }
      ),

      moveTo: Effect.fn('BlogPostRepository.moveTo')((id, to) => step[to](id)),

      reject: Effect.fn('BlogPostRepository.reject')((id) =>
        transition(db, 'BlogPost', id, {
          from: IN_PROGRESS_STATUSES,
          to: 'rejected',
        })
      ),

      updateSources: Effect.fn('BlogPostRepository.updateSources')(function* (
        id: string,
        sources: BlogPostSource[]
      ) {
        const [row] = yield* db
          .update(blogPosts)
          .set({ sources })
          .where(eq(blogPosts.id, id))
          .returning()
        return Option.getOrNull(Option.fromNullishOr(row))
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
        return Option.getOrNull(Option.fromNullishOr(row))
      }),

      updateRetryCount: Effect.fn('BlogPostRepository.updateRetryCount')(
        function* (id: string, retryCount: number) {
          const [row] = yield* db
            .update(blogPosts)
            .set({ retryCount })
            .where(eq(blogPosts.id, id))
            .returning()
          return Option.getOrNull(Option.fromNullishOr(row))
        }
      ),

      updateReview: Effect.fn('BlogPostRepository.updateReview')(function* (
        id: string,
        data: {
          reviewScore: number
          reviewFeedback: string
        }
      ) {
        const [row] = yield* db
          .update(blogPosts)
          .set({
            reviewScore: data.reviewScore,
            reviewFeedback: data.reviewFeedback,
          })
          .where(eq(blogPosts.id, id))
          .returning()
        return Option.getOrNull(Option.fromNullishOr(row))
      }),

      markPublished: Effect.fn('BlogPostRepository.markPublished')(function* (
        id: string,
        commitShas: LocalizedText
      ) {
        return yield* transition(db, 'BlogPost', id, {
          from: ['reviewing', 'rejected'],
          to: 'published',
          also: { commitShas, publishedAt: nowAsDate() },
        })
      }),
    }
  })
)
