import {
  mockFollowUser1,
  mockFollowUser2,
  mockFollowUsers,
} from '@lily/api/__tests__/fixtures/follows'
import { createMockFollowRepository } from '@lily/api/__tests__/mocks/follow.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { getFollowing } from '@lily/api/services/social/endpoints/get-following'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const currentUserId = 'user-1'

const buildLayer = (
  follows: Array<{
    followerId: string
    followingId: string
    createdAt: Date
  }> = []
) =>
  Layer.mergeAll(
    createMockCurrentUser({ id: currentUserId }),
    createMockFollowRepository({
      follows,
      users: mockFollowUsers,
    })
  )

describe('getFollowing', () => {
  it('should return paginated list of users being followed', async () => {
    const layer = buildLayer([
      {
        followerId: currentUserId,
        followingId: mockFollowUser1.id,
        createdAt: new Date(),
      },
      {
        followerId: currentUserId,
        followingId: mockFollowUser2.id,
        createdAt: new Date(),
      },
    ])

    const result = await Effect.runPromise(
      getFollowing({ page: '1', limit: '20' }).pipe(Effect.provide(layer))
    )
    expect(result.items).toHaveLength(2)
    expect(result.total).toBe(2)
    expect(result.page).toBe(1)
  })

  it('should return empty list when not following anyone', async () => {
    const result = await Effect.runPromise(
      getFollowing({ page: '1', limit: '20' }).pipe(
        Effect.provide(buildLayer())
      )
    )
    expect(result.items).toHaveLength(0)
    expect(result.total).toBe(0)
  })

  it('should include isFollowing status (always true for own list)', async () => {
    const layer = buildLayer([
      {
        followerId: currentUserId,
        followingId: mockFollowUser1.id,
        createdAt: new Date(),
      },
    ])

    const result = await Effect.runPromise(
      getFollowing({ page: '1', limit: '20' }).pipe(Effect.provide(layer))
    )
    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.isFollowing).toBe(true)
  })
})
