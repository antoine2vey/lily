import {
  BlogPostRepository,
  BlogPostRepositoryLive,
} from '@lily/api/repositories/blog-post.repository'
import { movePost } from '@lily/api/services/blog-generator/generator'
import { DrizzleLive, PgLive } from '@lily/db'
import { failureOf } from '@lily/shared/testing'
import { Effect, Layer, ManagedRuntime } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const RepositoryLive = BlogPostRepositoryLive.pipe(
  Layer.provideMerge(DrizzleLive),
  Layer.provideMerge(PgLive)
)

const HOUR_MS = 60 * 60 * 1000

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'A blog post the stale sweep rejects under its pipeline - Integration',
  () => {
    let pool: pg.Pool
    let runtime: ManagedRuntime.ManagedRuntime<BlogPostRepository, unknown>

    const insertPost = async (status: string, updatedAt: Date) => {
      const result = await pool.query<{ id: string }>(
        `INSERT INTO blog_posts (slug, title, category, tags, status, updated_at)
         VALUES ($1, '{"en":"Post"}', 'care-guide', '{}', $2, $3) RETURNING id`,
        [`post-${crypto.randomUUID()}`, status, updatedAt]
      )
      return result.rows[0]?.id ?? ''
    }

    const statusOf = async (id: string) => {
      const result = await pool.query<{ status: string }>(
        'SELECT status FROM blog_posts WHERE id = $1',
        [id]
      )
      return result.rows[0]?.status
    }

    const sweep = () =>
      runtime.runPromise(
        Effect.flatMap(BlogPostRepository, (repo) =>
          repo.rejectStalePosts(new Date(Date.now() - HOUR_MS))
        )
      )

    beforeAll(() => {
      pool = new pg.Pool({ connectionString: process.env.DATABASE_URL_TEST })
      runtime = ManagedRuntime.make(RepositoryLive)
    })

    beforeEach(async () => {
      await pool.query('TRUNCATE TABLE blog_posts')
    })

    afterAll(async () => {
      await runtime.dispose()
      await pool.end()
    })

    it('stops the pipeline at its next step and leaves the post rejected', async () => {
      const post = await insertPost(
        'generating',
        new Date(Date.now() - 2 * HOUR_MS)
      )
      expect(await sweep()).toBe(1)

      const exit = await runtime.runPromiseExit(movePost(post, 'reviewing'))

      expect(failureOf(exit)).toMatchObject({ _tag: 'BlogGenerationError' })
      expect(await statusOf(post)).toBe('rejected')
    })

    it('still marks the post published when its commit was pushed before the sweep', async () => {
      const post = await insertPost(
        'reviewing',
        new Date(Date.now() - 2 * HOUR_MS)
      )
      expect(await sweep()).toBe(1)

      const published = await runtime.runPromise(
        Effect.flatMap(BlogPostRepository, (repo) =>
          repo.markPublished(post, { en: 'sha-en' })
        )
      )

      expect(published._tag).toBe('Moved')
      expect(await statusOf(post)).toBe('published')
    })

    it('does not reject a post its pipeline published while the sweep ran', async () => {
      const post = await insertPost(
        'reviewing',
        new Date(Date.now() - 2 * HOUR_MS)
      )
      await runtime.runPromise(
        Effect.flatMap(BlogPostRepository, (repo) =>
          repo.markPublished(post, { en: 'sha-en' })
        )
      )

      const rejected = await runtime.runPromise(
        Effect.flatMap(BlogPostRepository, (repo) => repo.reject(post))
      )

      expect(rejected._tag).toBe('LostRace')
      expect(await statusOf(post)).toBe('published')
    })

    it('moves a post through each step of the pipeline in order', async () => {
      const post = await insertPost('pending', new Date())

      const moved = await runtime.runPromise(
        Effect.flatMap(BlogPostRepository, (repo) =>
          Effect.all([
            repo.moveTo(post, 'reviewing'),
            repo.moveTo(post, 'researching'),
            repo.moveTo(post, 'generating'),
            repo.moveTo(post, 'reviewing'),
            repo.moveTo(post, 'generating'),
          ])
        )
      )

      expect(moved.map((result) => result._tag)).toEqual([
        'LostRace',
        'Moved',
        'Moved',
        'Moved',
        'Moved',
      ])
      expect(await statusOf(post)).toBe('generating')
    })
  }
)
