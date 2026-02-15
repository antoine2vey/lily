# Task 03 — Follow Repository

[x] DONE

## Context

Depends on: Task 01 (DB schema), Task 02 (shared types).
Creates the data access layer for all follow/profile/search operations. All endpoint tasks (05–14) depend on this.

## Files to create

- `packages/api/src/repositories/follow.repository.ts` — FollowRepository interface + Live implementation

## Files to modify

None.

## Implementation

### Interface

```typescript
import { Context, Effect, Layer, Option } from 'effect'
import type { SqlError } from '@effect/sql'

export interface IFollowRepository {
  // Follow management
  readonly follow: (followerId: string, followingId: string) => Effect.Effect<void, SqlError>
  readonly unfollow: (followerId: string, followingId: string) => Effect.Effect<void, SqlError>
  readonly isFollowing: (followerId: string, followingId: string) => Effect.Effect<boolean, SqlError>

  // Follower/following lists (paginated)
  readonly getFollowers: (params: {
    userId: string
    currentUserId: string
    page: number
    limit: number
  }) => Effect.Effect<{ items: Array<UserCardRow>; total: number }, SqlError>

  readonly getFollowing: (params: {
    userId: string
    currentUserId: string
    page: number
    limit: number
  }) => Effect.Effect<{ items: Array<UserCardRow>; total: number }, SqlError>

  // Counts
  readonly getFollowerCount: (userId: string) => Effect.Effect<number, SqlError>
  readonly getFollowingCount: (userId: string) => Effect.Effect<number, SqlError>

  // Bulk check (for lists — avoids N+1)
  readonly getFollowingStatuses: (
    currentUserId: string,
    userIds: string[]
  ) => Effect.Effect<Set<string>, SqlError>

  // Search
  readonly searchUsers: (params: {
    query: string
    currentUserId: string
    page: number
    limit: number
  }) => Effect.Effect<{ items: Array<UserCardRow>; total: number }, SqlError>

  // Suggested users (users followed by people you follow, excluding already followed)
  readonly getSuggestedUsers: (params: {
    currentUserId: string
    limit: number
  }) => Effect.Effect<Array<UserCardRow>, SqlError>

  // Public profile data
  readonly getPublicProfile: (params: {
    targetUserId: string
    currentUserId: string
  }) => Effect.Effect<PublicProfileRow | null, SqlError>

  // Nudge tracking
  readonly getLastNudge: (
    fromUserId: string,
    toUserId: string
  ) => Effect.Effect<Date | null, SqlError>

  readonly recordNudge: (
    fromUserId: string,
    toUserId: string
  ) => Effect.Effect<void, SqlError>
}
```

### Row types (internal to repository)

```typescript
export interface UserCardRow {
  id: string
  name: string | null
  username: string | null
  image: string | null
  plantCount: number
  isFollowing: boolean
}

export interface PublicProfileRow {
  id: string
  name: string | null
  username: string | null
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
```

### Context.Tag

```typescript
export class FollowRepository extends Context.Tag('FollowRepository')<
  FollowRepository,
  IFollowRepository
>() {}
```

### Live Implementation

```typescript
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
        // JOIN users ON user_follows.follower_id = users.id
        // WHERE user_follows.following_id = params.userId
        // AND users.public_profile = true
        // LEFT JOIN to check if currentUser follows each follower
        // Returns paginated UserCardRow[]
        Effect.gen(function* () {
          // Count query
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

          // Data query with isFollowing subquery
          const offset = (params.page - 1) * params.limit
          const rows = yield* db
            .select({
              id: users.id,
              name: users.name,
              username: users.username,
              image: users.image,
              plantCount: sql<number>`(SELECT count(*) FROM plants WHERE plants.user_id = ${users.id})`,
              isFollowing: sql<boolean>`EXISTS (
                SELECT 1 FROM user_follows
                WHERE follower_id = ${params.currentUserId}
                AND following_id = ${users.id}
              )`,
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
            .limit(params.limit)

          return { items: rows, total }
        }).pipe(Effect.withSpan('FollowRepository.getFollowers')),

      // getFollowing: similar pattern, JOIN on following_id
      // searchUsers: ILIKE on name/username, WHERE publicProfile = true
      // getSuggestedUsers: friends-of-friends query
      // getPublicProfile: single user JOIN with counts
      // getLastNudge/recordNudge: use notifications table with type='nudge_to_water'
    }
  })
)
```

### Key SQL patterns

- **searchUsers**: `WHERE (users.name ILIKE '%query%' OR users.username ILIKE '%query%') AND users.public_profile = true AND users.id != currentUserId`
- **getSuggestedUsers**: `SELECT DISTINCT u.* FROM user_follows f1 JOIN user_follows f2 ON f1.following_id = f2.follower_id JOIN users u ON f2.following_id = u.id WHERE f1.follower_id = currentUserId AND u.id != currentUserId AND u.public_profile = true AND NOT EXISTS (SELECT 1 FROM user_follows WHERE follower_id = currentUserId AND following_id = u.id) LIMIT params.limit`
- **getLastNudge**: `SELECT created_at FROM notifications WHERE type = 'nudge_to_water' AND user_id = toUserId AND ... ORDER BY created_at DESC LIMIT 1` — or use a dedicated `nudge_logs` in-memory map / simple table. Simplest: store last nudge timestamp in a Map or add a `nudges` table. **Decision: use a simple `user_nudges` helper table or query notifications table.** Since notifications already have `type` and `userId`, we can query that. But we need `fromUserId` which notifications don't track. **Create a small `nudges` tracking within the follow repository using an in-memory Map for MVP, or add a `nudge_from_user_id` field.** Simplest approach: add a column to the notifications or create a minimal `user_nudges` table. Let's **query the notifications table** but filter by a metadata convention. Actually simpler: just track in the follow repository using an `Effect.Ref` or a simple DB query. **Final decision: Create a `user_nudges` table with `(from_user_id, to_user_id, created_at)` in the same migration or a separate one.** See note below.

### Nudge tracking addendum

Add a `user_nudges` table to `packages/db/src/schema/social.ts`:

```typescript
export const userNudges = pgTable('user_nudges', {
  id: uuid('id').primaryKey().defaultRandom(),
  fromUserId: uuid('from_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  toUserId: uuid('to_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})
```

This keeps nudge rate-limiting queryable: `SELECT * FROM user_nudges WHERE from_user_id = ? AND to_user_id = ? AND created_at > NOW() - INTERVAL '1 day'`.

> **Note:** Add `userNudges` to the same migration as `userFollows` (Task 01) OR create a separate migration here. If Task 01 is already committed, create migration 0026.

## Reference

- Copy repository pattern from `packages/api/src/repositories/plant.repository.ts`
- Copy pagination helper from `packages/api/src/services/helpers/pagination.ts`

## Tests

- `packages/api/src/__tests__/mocks/follow.repository.ts` — Create mock. Will be used by endpoint tests in tasks 05–14.
- `packages/api/src/__tests__/fixtures/follows.ts` — Create fixture data for follows.

No standalone repo tests — tested indirectly via endpoint tests.

## Review checklist

After implementing, run these agents before committing:
1. **Code review agent** — check for bugs, logic errors, adherence to project conventions (Effect patterns, no native JS methods, etc.)
2. **Security agent** — check for injection vulnerabilities, auth bypass, data leakage, OWASP top 10
3. **Scalability check** — review DB queries for N+1, missing indexes, pagination correctness
4. **Code quality agent** — simplify, remove duplication, ensure consistency with existing codebase

## Verify

```bash
cd packages/api && bun run typecheck
```

## Commit

```
feat(social): add FollowRepository with follow, search, and profile queries
```
