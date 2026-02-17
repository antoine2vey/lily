import { mockFollowUsers } from '@lily/api/__tests__/fixtures/follows'
import { createMockFollowRepository } from '@lily/api/__tests__/mocks/follow.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { getSuggestedUsers } from '@lily/api/services/social/endpoints/get-suggested-users'
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

describe('getSuggestedUsers', () => {
  it('should return friends-of-friends suggestions', async () => {
    // user-1 follows follow-user-1, follow-user-1 follows follow-user-2
    // so follow-user-2 should be suggested
    const layer = buildLayer([
      {
        followerId: currentUserId,
        followingId: 'follow-user-1',
        createdAt: new Date(),
      },
      {
        followerId: 'follow-user-1',
        followingId: 'follow-user-2',
        createdAt: new Date(),
      },
    ])

    const result = await Effect.runPromise(
      getSuggestedUsers().pipe(Effect.provide(layer))
    )
    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe('follow-user-2')
  })

  it('should return empty list when no suggestions available', async () => {
    const result = await Effect.runPromise(
      getSuggestedUsers().pipe(Effect.provide(buildLayer()))
    )
    expect(result).toHaveLength(0)
  })

  it('should not suggest users already followed', async () => {
    const layer = buildLayer([
      {
        followerId: currentUserId,
        followingId: 'follow-user-1',
        createdAt: new Date(),
      },
      {
        followerId: currentUserId,
        followingId: 'follow-user-2',
        createdAt: new Date(),
      },
      {
        followerId: 'follow-user-1',
        followingId: 'follow-user-2',
        createdAt: new Date(),
      },
    ])

    const result = await Effect.runPromise(
      getSuggestedUsers().pipe(Effect.provide(layer))
    )
    expect(result).toHaveLength(0)
  })

  it('should not suggest private users', async () => {
    const layer = buildLayer([
      {
        followerId: currentUserId,
        followingId: 'follow-user-1',
        createdAt: new Date(),
      },
      {
        followerId: 'follow-user-1',
        followingId: 'private-user-1',
        createdAt: new Date(),
      },
    ])

    const result = await Effect.runPromise(
      getSuggestedUsers().pipe(Effect.provide(layer))
    )
    expect(result).toHaveLength(0)
  })
})
