import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import {
  FollowRepository,
  FollowRepositoryLive,
} from '@lily/api/repositories/follow.repository'
import {
  UserRepository,
  UserRepositoryLive,
} from '@lily/api/repositories/user.repository'
import { getPublicProfile } from '@lily/api/services/social/endpoints/get-public-profile'
import { getUserFollowers } from '@lily/api/services/social/endpoints/get-user-followers'
import { getUserFollowing } from '@lily/api/services/social/endpoints/get-user-following'
import { DrizzleLive } from '@lily/db'
import * as schema from '@lily/db/schema'
import { failureOf } from '@lily/shared/testing'
import { eq, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Array, ConfigProvider, Effect, Layer, Order } from 'effect'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const { Pool } = pg

const ACCOUNTS = [
  'subject',
  'leavingFollowee',
  'leavingFollower',
  'suspendedFollower',
  'friend',
  'leavingFriendOfFriend',
  'friendOfFriend',
  'viewer',
] as const
type Account = (typeof ACCOUNTS)[number]

const FOLLOWS: ReadonlyArray<readonly [Account, Account]> = [
  ['subject', 'leavingFollowee'],
  ['subject', 'friend'],
  ['leavingFollower', 'subject'],
  ['suspendedFollower', 'subject'],
  ['friend', 'subject'],
  ['friend', 'leavingFriendOfFriend'],
  ['friend', 'friendOfFriend'],
]

describe.skipIf(!process.env.DATABASE_URL_TEST)(
  'Social reads hide accounts that are not active - Integration',
  () => {
    let pool: pg.Pool
    let db: ReturnType<typeof drizzle>
    const run = Date.now().toString(36)
    const ids = new Map<Account, string>()
    const idOf = (account: Account) => ids.get(account) ?? ''
    const nameOf = (account: Account) => `h${run}_${account}`

    const ReposLive = Layer.mergeAll(
      FollowRepositoryLive,
      UserRepositoryLive
    ).pipe(
      Layer.provide(DrizzleLive),
      Layer.provide(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({
            DATABASE_URL: process.env.DATABASE_URL_TEST,
          })
        )
      )
    )

    const seenBy = (viewer: Account) =>
      Layer.merge(ReposLive, createMockCurrentUser({ id: idOf(viewer) }))

    const names = (items: ReadonlyArray<{ name: string | null }>) =>
      Array.sort(
        Array.map(items, (item) => item.name ?? ''),
        Order.String
      )

    const list = (kind: 'getFollowers' | 'getFollowing', viewer: Account) =>
      Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* FollowRepository
          const { items, total } = yield* repo[kind]({
            userId: idOf('subject'),
            currentUserId: idOf(viewer),
          })
          return { names: names(items), total }
        }).pipe(Effect.provide(ReposLive))
      )

    const profileCounts = () =>
      Effect.runPromise(
        getPublicProfile(idOf('subject')).pipe(
          Effect.map(({ followerCount, followingCount }) => ({
            followerCount,
            followingCount,
          })),
          Effect.provide(seenBy('viewer'))
        )
      )

    beforeAll(async () => {
      pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST })
      db = drizzle(pool, { schema })
      const rows = await db
        .insert(schema.users)
        .values(
          Array.map(ACCOUNTS, (account) => ({
            name: nameOf(account),
            status:
              account === 'suspendedFollower'
                ? ('suspended' as const)
                : ('active' as const),
            publicProfile: true,
            email: `social-hidden-${run}-${account}@example.com`,
            emailVerified: true,
          }))
        )
        .returning({ id: schema.users.id, name: schema.users.name })
      Array.forEach(ACCOUNTS, (account) => {
        ids.set(
          account,
          rows.find((row) => row.name === nameOf(account))?.id ?? ''
        )
      })

      await db.insert(schema.userFollows).values(
        Array.map(FOLLOWS, ([follower, following]) => ({
          followerId: idOf(follower),
          followingId: idOf(following),
        }))
      )

      await Effect.runPromise(
        Effect.gen(function* () {
          const users = yield* UserRepository
          yield* Effect.forEach(
            [
              'leavingFollowee',
              'leavingFollower',
              'leavingFriendOfFriend',
            ] as const,
            (account) => users.softDelete(idOf(account))
          )
        }).pipe(Effect.provide(ReposLive))
      )
    })

    afterAll(async () => {
      await db
        .delete(schema.users)
        .where(inArray(schema.users.id, [...ids.values()]))
      await pool.end()
    })

    it.each(['viewer', 'subject'] as const)(
      'the follower list seen by the %s leaves out a leaving and a suspended follower',
      async (viewer) => {
        expect(await list('getFollowers', viewer)).toEqual({
          names: [nameOf('friend')],
          total: 1,
        })
      }
    )

    it.each(['viewer', 'subject'] as const)(
      'the following list seen by the %s leaves out a leaving account',
      async (viewer) => {
        expect(await list('getFollowing', viewer)).toEqual({
          names: [nameOf('friend')],
          total: 1,
        })
      }
    )

    it('suggestions leave out a leaving friend of a friend', async () => {
      const suggested = await Effect.runPromise(
        Effect.gen(function* () {
          const repo = yield* FollowRepository
          return yield* repo.getSuggestedUsers({
            currentUserId: idOf('subject'),
          })
        }).pipe(Effect.provide(ReposLive))
      )

      expect(names(suggested)).toEqual([nameOf('friendOfFriend')])
    })

    it('the public profile counts only active followers and followees', async () => {
      expect(await profileCounts()).toEqual({
        followerCount: 1,
        followingCount: 1,
      })
    })

    const firstPage = { page: '1', limit: '20' }

    it.each([
      ['profile', (id: string) => Effect.asVoid(getPublicProfile(id))],
      [
        'follower list',
        (id: string) => Effect.asVoid(getUserFollowers(id, firstPage)),
      ],
      [
        'following list',
        (id: string) => Effect.asVoid(getUserFollowing(id, firstPage)),
      ],
    ] as const)(
      'the %s of a leaving account answers as a missing user',
      async (_, read) => {
        const exit = await Effect.runPromiseExit(
          read(idOf('leavingFollowee')).pipe(Effect.provide(seenBy('viewer')))
        )

        expect(failureOf(exit)._tag).toBe('UserNotFoundError')
      }
    )

    it('a restored account shows again in the list and the count', async () => {
      await db
        .update(schema.users)
        .set({ status: 'active', deletedAt: null })
        .where(eq(schema.users.id, idOf('leavingFollower')))

      expect(await list('getFollowers', 'viewer')).toEqual({
        names: [nameOf('friend'), nameOf('leavingFollower')],
        total: 2,
      })
      expect(await profileCounts()).toEqual({
        followerCount: 2,
        followingCount: 1,
      })
    })
  }
)
