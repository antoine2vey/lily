import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import {
  extractCount,
  getPaginationParams,
} from '@lily/api/repositories/helpers/pagination'
import { userFollows, userNudges, users } from '@lily/db'
import { and, count, desc, eq, ilike, ne, sql } from 'drizzle-orm'
import { Array, Context, Effect, Layer, Option, pipe } from 'effect'

export interface UserCardRow {
  id: string
  name: string | null
  image: string | null
  plantCount: number
  isFollowing: boolean
}

export interface PublicProfileRow {
  id: string
  name: string | null
  image: string | null
  bio: string | null
  plantCount: number
  followerCount: number
  followingCount: number
  isFollowing: boolean
  shareGrowthData: boolean
  publicProfile: boolean
  createdAt: Date
}

export interface IFollowRepository {
  readonly follow: (
    followerId: string,
    followingId: string
  ) => Effect.Effect<void, SqlError>

  readonly unfollow: (
    followerId: string,
    followingId: string
  ) => Effect.Effect<void, SqlError>

  readonly isFollowing: (
    followerId: string,
    followingId: string
  ) => Effect.Effect<boolean, SqlError>

  readonly getFollowers: (params: {
    userId: string
    currentUserId: string
    page?: number
    limit?: number
  }) => Effect.Effect<
    { items: ReadonlyArray<UserCardRow>; total: number },
    SqlError
  >

  readonly getFollowing: (params: {
    userId: string
    currentUserId: string
    page?: number
    limit?: number
  }) => Effect.Effect<
    { items: ReadonlyArray<UserCardRow>; total: number },
    SqlError
  >

  readonly getFollowerCount: (userId: string) => Effect.Effect<number, SqlError>

  readonly getFollowingCount: (
    userId: string
  ) => Effect.Effect<number, SqlError>

  readonly getFollowingStatuses: (
    currentUserId: string,
    userIds: ReadonlyArray<string>
  ) => Effect.Effect<Set<string>, SqlError>

  readonly searchUsers: (params: {
    query: string
    currentUserId: string
    page?: number
    limit?: number
  }) => Effect.Effect<
    { items: ReadonlyArray<UserCardRow>; total: number },
    SqlError
  >

  readonly getSuggestedUsers: (params: {
    currentUserId: string
    limit?: number
  }) => Effect.Effect<ReadonlyArray<UserCardRow>, SqlError>

  readonly getPublicProfile: (params: {
    targetUserId: string
    currentUserId: string
  }) => Effect.Effect<PublicProfileRow | null, SqlError>

  readonly getLastNudge: (
    fromUserId: string,
    toUserId: string
  ) => Effect.Effect<Date | null, SqlError>

  readonly recordNudge: (
    fromUserId: string,
    toUserId: string
  ) => Effect.Effect<void, SqlError>
}

export class FollowRepository extends Context.Tag('FollowRepository')<
  FollowRepository,
  IFollowRepository
>() {}

const isFollowingSubquery = (currentUserId: string) =>
  sql<boolean>`EXISTS (
    SELECT 1 FROM user_follows
    WHERE follower_id = ${currentUserId}
    AND following_id = ${users.id}
  )`

const plantCountSubquery = () =>
  sql<number>`(SELECT count(*)::int FROM plants WHERE plants.user_id = ${users.id})`

export const FollowRepositoryLive = Layer.effect(
  FollowRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    return {
      follow: (followerId, followingId) =>
        Effect.gen(function* () {
          yield* db.insert(userFollows).values({ followerId, followingId })
        }).pipe(Effect.withSpan('FollowRepository.follow')),

      unfollow: (followerId, followingId) =>
        Effect.gen(function* () {
          yield* db
            .delete(userFollows)
            .where(
              and(
                eq(userFollows.followerId, followerId),
                eq(userFollows.followingId, followingId)
              )
            )
        }).pipe(Effect.withSpan('FollowRepository.unfollow')),

      isFollowing: (followerId, followingId) =>
        Effect.gen(function* () {
          const [row] = yield* db
            .select({ id: userFollows.id })
            .from(userFollows)
            .where(
              and(
                eq(userFollows.followerId, followerId),
                eq(userFollows.followingId, followingId)
              )
            )
            .limit(1)
          return row !== undefined
        }).pipe(Effect.withSpan('FollowRepository.isFollowing')),

      getFollowers: (params) =>
        Effect.gen(function* () {
          const { limit, offset } = getPaginationParams(params)

          const countResult = yield* db
            .select({ value: count() })
            .from(userFollows)
            .innerJoin(users, eq(userFollows.followerId, users.id))
            .where(
              and(
                eq(userFollows.followingId, params.userId),
                eq(users.publicProfile, true)
              )
            )
          const total = extractCount(countResult)

          const rows = yield* db
            .select({
              id: users.id,
              name: users.name,
              image: users.image,
              plantCount: plantCountSubquery(),
              isFollowing: isFollowingSubquery(params.currentUserId),
            })
            .from(userFollows)
            .innerJoin(users, eq(userFollows.followerId, users.id))
            .where(
              and(
                eq(userFollows.followingId, params.userId),
                eq(users.publicProfile, true)
              )
            )
            .orderBy(desc(userFollows.createdAt))
            .offset(offset)
            .limit(limit)

          return { items: rows, total }
        }).pipe(Effect.withSpan('FollowRepository.getFollowers')),

      getFollowing: (params) =>
        Effect.gen(function* () {
          const { limit, offset } = getPaginationParams(params)

          const countResult = yield* db
            .select({ value: count() })
            .from(userFollows)
            .innerJoin(users, eq(userFollows.followingId, users.id))
            .where(eq(userFollows.followerId, params.userId))
          const total = extractCount(countResult)

          const rows = yield* db
            .select({
              id: users.id,
              name: users.name,
              image: users.image,
              plantCount: plantCountSubquery(),
              isFollowing: isFollowingSubquery(params.currentUserId),
            })
            .from(userFollows)
            .innerJoin(users, eq(userFollows.followingId, users.id))
            .where(eq(userFollows.followerId, params.userId))
            .orderBy(desc(userFollows.createdAt))
            .offset(offset)
            .limit(limit)

          return { items: rows, total }
        }).pipe(Effect.withSpan('FollowRepository.getFollowing')),

      getFollowerCount: (userId) =>
        Effect.gen(function* () {
          const result = yield* db
            .select({ value: count() })
            .from(userFollows)
            .where(eq(userFollows.followingId, userId))
          return extractCount(result)
        }).pipe(Effect.withSpan('FollowRepository.getFollowerCount')),

      getFollowingCount: (userId) =>
        Effect.gen(function* () {
          const result = yield* db
            .select({ value: count() })
            .from(userFollows)
            .where(eq(userFollows.followerId, userId))
          return extractCount(result)
        }).pipe(Effect.withSpan('FollowRepository.getFollowingCount')),

      getFollowingStatuses: (currentUserId, userIds) =>
        Effect.gen(function* () {
          if (userIds.length === 0) return new Set<string>()
          const rows = yield* db
            .select({ followingId: userFollows.followingId })
            .from(userFollows)
            .where(
              and(
                eq(userFollows.followerId, currentUserId),
                sql`${userFollows.followingId} = ANY(${sql.raw(`ARRAY[${Array.map(userIds, (id) => `'${id}'`).join(',')}]::uuid[]`)})`
              )
            )
          return new Set(Array.map(rows, (r) => r.followingId))
        }).pipe(Effect.withSpan('FollowRepository.getFollowingStatuses')),

      searchUsers: (params) =>
        Effect.gen(function* () {
          const { limit, offset } = getPaginationParams(params)
          const searchPattern = `%${params.query}%`

          const whereClause = and(
            eq(users.publicProfile, true),
            ne(users.id, params.currentUserId),
            ilike(users.name, searchPattern)
          )

          const countResult = yield* db
            .select({ value: count() })
            .from(users)
            .where(whereClause)
          const total = extractCount(countResult)

          const rows = yield* db
            .select({
              id: users.id,
              name: users.name,
              image: users.image,
              plantCount: plantCountSubquery(),
              isFollowing: isFollowingSubquery(params.currentUserId),
            })
            .from(users)
            .where(whereClause)
            .orderBy(users.name)
            .offset(offset)
            .limit(limit)

          return { items: rows, total }
        }).pipe(Effect.withSpan('FollowRepository.searchUsers')),

      getSuggestedUsers: (params) =>
        Effect.gen(function* () {
          const limit = pipe(
            Option.fromNullable(params.limit),
            Option.getOrElse(() => 10)
          )

          // Friends-of-friends: users followed by people you follow,
          // excluding yourself and users you already follow
          const rows = yield* db
            .select({
              id: users.id,
              name: users.name,
              image: users.image,
              plantCount: plantCountSubquery(),
              isFollowing: sql<boolean>`false`,
            })
            .from(users)
            .where(
              and(
                eq(users.publicProfile, true),
                ne(users.id, params.currentUserId),
                sql`${users.id} IN (
                  SELECT DISTINCT f2.following_id
                  FROM user_follows f1
                  JOIN user_follows f2 ON f1.following_id = f2.follower_id
                  WHERE f1.follower_id = ${params.currentUserId}
                  AND f2.following_id != ${params.currentUserId}
                )`,
                sql`${users.id} NOT IN (
                  SELECT following_id FROM user_follows
                  WHERE follower_id = ${params.currentUserId}
                )`
              )
            )
            .limit(limit)

          return rows
        }).pipe(Effect.withSpan('FollowRepository.getSuggestedUsers')),

      getPublicProfile: (params) =>
        Effect.gen(function* () {
          const followerCountSql = sql<number>`(
            SELECT count(*)::int FROM user_follows
            WHERE following_id = ${users.id}
          )`
          const followingCountSql = sql<number>`(
            SELECT count(*)::int FROM user_follows
            WHERE follower_id = ${users.id}
          )`

          const [row] = yield* db
            .select({
              id: users.id,
              name: users.name,
              image: users.image,
              bio: users.bio,
              plantCount: plantCountSubquery(),
              followerCount: followerCountSql,
              followingCount: followingCountSql,
              isFollowing: isFollowingSubquery(params.currentUserId),
              shareGrowthData: users.shareGrowthData,
              publicProfile: users.publicProfile,
              createdAt: users.createdAt,
            })
            .from(users)
            .where(eq(users.id, params.targetUserId))

          return pipe(Option.fromNullable(row), Option.getOrNull)
        }).pipe(Effect.withSpan('FollowRepository.getPublicProfile')),

      getLastNudge: (fromUserId, toUserId) =>
        Effect.gen(function* () {
          const [row] = yield* db
            .select({ createdAt: userNudges.createdAt })
            .from(userNudges)
            .where(
              and(
                eq(userNudges.fromUserId, fromUserId),
                eq(userNudges.toUserId, toUserId)
              )
            )
            .orderBy(desc(userNudges.createdAt))
            .limit(1)

          return pipe(
            Option.fromNullable(row),
            Option.map((r) => r.createdAt),
            Option.getOrNull
          )
        }).pipe(Effect.withSpan('FollowRepository.getLastNudge')),

      recordNudge: (fromUserId, toUserId) =>
        Effect.gen(function* () {
          yield* db.insert(userNudges).values({ fromUserId, toUserId })
        }).pipe(Effect.withSpan('FollowRepository.recordNudge')),
    }
  })
)
