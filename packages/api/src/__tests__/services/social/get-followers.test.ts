import {
  mockFollowUser1,
  mockFollowUser2,
  mockFollowUsers,
} from '@lily/api/__tests__/fixtures/follows'
import { createMockFollowRepository } from '@lily/api/__tests__/mocks/follow.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { getFollowers } from '@lily/api/services/social/endpoints/get-followers'
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

describe('getFollowers', () => {
  it('should return paginated list of followers', async () => {
    const layer = buildLayer([
      {
        followerId: mockFollowUser1.id,
        followingId: currentUserId,
        createdAt: new Date(),
      },
      {
        followerId: mockFollowUser2.id,
        followingId: currentUserId,
        createdAt: new Date(),
      },
    ])

    const result = await Effect.runPromise(
      getFollowers({}).pipe(Effect.provide(layer))
    )
    expect(result.items).toHaveLength(2)
    expect(result.total).toBe(2)
    expect(result.page).toBe(1)
  })

  it('should return empty list when no followers', async () => {
    const result = await Effect.runPromise(
      getFollowers({}).pipe(Effect.provide(buildLayer()))
    )
    expect(result.items).toHaveLength(0)
    expect(result.total).toBe(0)
  })

  it('should include isFollowing status for each follower', async () => {
    const layer = buildLayer([
      {
        followerId: mockFollowUser1.id,
        followingId: currentUserId,
        createdAt: new Date(),
      },
      {
        followerId: currentUserId,
        followingId: mockFollowUser1.id,
        createdAt: new Date(),
      },
    ])

    const result = await Effect.runPromise(
      getFollowers({}).pipe(Effect.provide(layer))
    )
    expect(result.items).toHaveLength(1)
    expect(result.items[0].isFollowing).toBe(true)
  })
})
