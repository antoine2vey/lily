import {
  FollowRepository,
  FollowRepositoryLive,
} from '@lily/api/repositories/follow.repository'
import { DrizzleLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Array, ConfigProvider, Effect, Layer } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const { Pool } = pg

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'FollowRepository follower and following lists - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle>
    const run = Date.now().toString(36)
    const ids: string[] = []
    let subject = ''
    let publicPeer = ''
    let privatePeer = ''
    let viewer = ''

    const RepoLive = FollowRepositoryLive.pipe(
      Layer.provide(DrizzleLive),
      Layer.provide(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({
            DATABASE_URL: process.env.DATABASE_URL_TEST,
          })
        )
      )
    )

    const list = (
      kind: 'getFollowers' | 'getFollowing',
      currentUserId: string
    ) =>
      Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* FollowRepository
          const { items, total } = yield* repo[kind]({
            userId: subject,
            currentUserId,
          })
          return { names: Array.map(items, (item) => item.name), total }
        }).pipe(Effect.provide(RepoLive))
      )

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
      const rows = await db
        .insert(schema.users)
        .values(
          Array.map(
            [
              { key: 'subject', publicProfile: true },
              { key: 'public', publicProfile: true },
              { key: 'private', publicProfile: false },
              { key: 'viewer', publicProfile: true },
            ],
            ({ key, publicProfile }) => ({
              name: `f${run}_${key}`,
              publicProfile,
              email: `follow-lists-${run}-${key}@example.com`,
              emailVerified: true,
            })
          )
        )
        .returning({ id: schema.users.id, name: schema.users.name })
      ids.push(...Array.map(rows, (row) => row.id))
      const idOf = (key: string) =>
        rows.find((row) => row.name === `f${run}_${key}`)?.id ?? ''
      subject = idOf('subject')
      publicPeer = idOf('public')
      privatePeer = idOf('private')
      viewer = idOf('viewer')

      await db.insert(schema.userFollows).values([
        { followerId: subject, followingId: publicPeer },
        { followerId: subject, followingId: privatePeer },
        { followerId: publicPeer, followingId: subject },
        { followerId: privatePeer, followingId: subject },
      ])
    })

    afterAll(async () => {
      await db.delete(schema.users).where(inArray(schema.users.id, ids))
      await pool.end()
    })

    it.each(['getFollowing', 'getFollowers'] as const)(
      '%s on someone else leaves out private accounts from items and total',
      async (kind) => {
        expect(await list(kind, viewer)).toEqual({
          names: [`f${run}_public`],
          total: 1,
        })
      }
    )

    it.each(['getFollowing', 'getFollowers'] as const)(
      '%s on your own list keeps private accounts in items and total',
      async (kind) => {
        const { names, total } = await list(kind, subject)
        expect([...names].sort()).toEqual([`f${run}_private`, `f${run}_public`])
        expect(total).toBe(2)
      }
    )
  }
)
