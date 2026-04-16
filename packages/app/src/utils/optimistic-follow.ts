import type { QueryClient, QueryKey } from '@tanstack/react-query'
import { Array as Arr, Either, Match, Option, pipe } from 'effect'
import type { ApiResult } from '@/utils/client'
import { queryKeys } from '@/utils/query-keys'

/**
 * Snapshot of all cached social queries, used for rollback on failure.
 */
export type SocialCacheSnapshot = ReadonlyArray<readonly [QueryKey, unknown]>

/**
 * Cached data shapes that appear in social queries.
 */
interface FollowableItem {
  readonly id: string
  readonly isFollowing: boolean
}

interface ProfileData extends FollowableItem {
  readonly followerCount: number
}

interface PaginatedData {
  readonly items: ReadonlyArray<FollowableItem>
  readonly total: number
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

function isFollowableItem(value: unknown): value is FollowableItem {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'isFollowing' in value
  )
}

function isProfileForUser(
  value: unknown,
  userId: string
): value is ProfileData {
  return isFollowableItem(value) && value.id === userId
}

function isPaginatedData(value: unknown): value is PaginatedData {
  return (
    typeof value === 'object' &&
    value !== null &&
    'items' in value &&
    'total' in value &&
    Array.isArray((value as PaginatedData).items)
  )
}

function isFollowableArray(
  value: unknown
): value is ReadonlyArray<FollowableItem> {
  return Array.isArray(value)
}

function hasTotalField(value: unknown): value is { readonly total: number } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'total' in value &&
    typeof (value as { total: unknown }).total === 'number'
  )
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

/**
 * Extract the Right payload from a cached Either value.
 * Returns None if the value is missing, not an Either, or is a Left.
 */
function unwrapCachedEither(raw: unknown): Option.Option<unknown> {
  if (!raw || !Either.isEither(raw) || Either.isLeft(raw)) {
    return Option.none()
  }
  return Option.some(raw.right)
}

/**
 * Save a snapshot of all social queries for later rollback.
 */
export function saveSocialSnapshot(
  queryClient: QueryClient
): SocialCacheSnapshot {
  return queryClient.getQueriesData({
    queryKey: queryKeys.social.all,
  })
}

/**
 * Restore cached social queries from a previous snapshot.
 */
export function restoreSocialSnapshot(
  queryClient: QueryClient,
  snapshot: SocialCacheSnapshot
): void {
  Arr.forEach(snapshot, ([key, value]) => {
    queryClient.setQueryData(key, value)
  })
}

// ---------------------------------------------------------------------------
// Patch functions (pure, operate on unwrapped data)
// ---------------------------------------------------------------------------

function patchFollowableItems(
  items: ReadonlyArray<FollowableItem>,
  targetUserId: string,
  isFollowing: boolean
): ReadonlyArray<FollowableItem> {
  return Arr.map(items, (item) =>
    item.id === targetUserId ? { ...item, isFollowing } : item
  )
}

// ---------------------------------------------------------------------------
// Main update
// ---------------------------------------------------------------------------

/**
 * Optimistically update `isFollowing` across all cached social queries.
 *
 * Cached data is wrapped in `Either<ApiFailure, Data>`. This helper
 * unwraps, patches any matching userId, and re-wraps.
 */
export function optimisticFollowUpdate(
  queryClient: QueryClient,
  targetUserId: string,
  isFollowing: boolean
): void {
  const followerDelta = isFollowing ? 1 : -1

  queryClient.setQueriesData<ApiResult<unknown>>(
    { queryKey: queryKeys.social.all },
    (old) =>
      pipe(
        unwrapCachedEither(old),
        Option.match({
          onNone: () => old,
          onSome: (data) =>
            pipe(
              Match.value(data),
              Match.when(
                (d: unknown): d is ProfileData =>
                  isProfileForUser(d, targetUserId),
                (profile) => {
                  const followerCount = Math.max(
                    0,
                    profile.followerCount + followerDelta
                  )
                  return Either.right({
                    ...profile,
                    isFollowing,
                    followerCount,
                  })
                }
              ),
              Match.when(isPaginatedData, (paginated) =>
                Either.right({
                  ...paginated,
                  items: patchFollowableItems(
                    paginated.items,
                    targetUserId,
                    isFollowing
                  ),
                })
              ),
              Match.when(isFollowableArray, (items) =>
                Either.right(
                  patchFollowableItems(items, targetUserId, isFollowing)
                )
              ),
              Match.orElse(() => old)
            ),
        })
      )
  )

  updatePaginatedTotal(queryClient, ['social', 'getFollowing'], followerDelta)
  updatePaginatedTotal(
    queryClient,
    ['social', 'getUserFollowers'],
    followerDelta
  )
}

/**
 * Bump the `total` field on cached paginated responses matching the key prefix.
 */
function updatePaginatedTotal(
  queryClient: QueryClient,
  keyPrefix: readonly string[],
  delta: number
): void {
  queryClient.setQueriesData<ApiResult<unknown>>(
    { queryKey: keyPrefix },
    (old) =>
      pipe(
        unwrapCachedEither(old),
        Option.match({
          onNone: () => old,
          onSome: (data) =>
            hasTotalField(data)
              ? Either.right({
                  ...data,
                  total: Math.max(0, data.total + delta),
                })
              : old,
        })
      )
  )
}
