import type { QueryClient } from '@tanstack/react-query'
import { Array as Arr, Match, pipe } from 'effect'
import {
  type CacheSnapshot,
  patchCachedResults,
} from '@/utils/optimistic-cache'
import { queryKeys } from '@/utils/query-keys'

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
 * Optimistically update `isFollowing` across all cached social queries and
 * return the snapshot to restore on failure.
 */
export function optimisticFollowUpdate(
  queryClient: QueryClient,
  targetUserId: string,
  isFollowing: boolean
): CacheSnapshot {
  const followerDelta = isFollowing ? 1 : -1

  const snapshot = patchCachedResults<unknown>(
    queryClient,
    { queryKey: queryKeys.social.all },
    (data) =>
      pipe(
        Match.value(data),
        Match.when(
          (d: unknown): d is ProfileData => isProfileForUser(d, targetUserId),
          (profile) => ({
            ...profile,
            isFollowing,
            followerCount: Math.max(0, profile.followerCount + followerDelta),
          })
        ),
        Match.when(isPaginatedData, (paginated) => ({
          ...paginated,
          items: patchFollowableItems(
            paginated.items,
            targetUserId,
            isFollowing
          ),
        })),
        Match.when(isFollowableArray, (items) =>
          patchFollowableItems(items, targetUserId, isFollowing)
        ),
        Match.orElse(() => data)
      )
  )

  updatePaginatedTotal(queryClient, ['social', 'getFollowing'], followerDelta)
  updatePaginatedTotal(
    queryClient,
    ['social', 'getUserFollowers'],
    followerDelta
  )
  return snapshot
}

/**
 * Bump the `total` field on cached paginated responses matching the key prefix.
 */
function updatePaginatedTotal(
  queryClient: QueryClient,
  keyPrefix: readonly string[],
  delta: number
): void {
  patchCachedResults<unknown>(queryClient, { queryKey: keyPrefix }, (data) =>
    hasTotalField(data)
      ? { ...data, total: Math.max(0, data.total + delta) }
      : data
  )
}
