import { createTestUser } from '@lily/api/__tests__/fixtures/users'
import { createMockFollowRepository } from '@lily/api/__tests__/mocks/follow.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { unfollowUser } from '@lily/api/services/social/endpoints/unfollow-user'
import { Effect, Exit, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const currentUserId = 'current-user'
const targetUser = createTestUser({
  id: 'target-user',
  name: 'Target User',
  publicProfile: true,
})

const mockFollowUsers = [
  {
    id: targetUser.id,
    name: targetUser.name,
    image: targetUser.image,
    bio: targetUser.bio,
    plantCount: 5,
    publicProfile: true,
    shareGrowthData: true,
    createdAt: targetUser.createdAt,
  },
]

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
    }),
    createMockUserRepository([targetUser])
  )

describe('unfollowUser', () => {
  it('should unfollow a user successfully', async () => {
    const layer = buildLayer([
      {
        followerId: currentUserId,
        followingId: targetUser.id,
        createdAt: new Date(),
      },
    ])

    const result = await Effect.runPromise(
      unfollowUser(targetUser.id).pipe(Effect.provide(layer))
    )
    expect(result).toEqual({ success: true })
  })

  it('should fail with CannotFollowSelfError when unfollowing self', async () => {
    const exit = await Effect.runPromiseExit(
      unfollowUser(currentUserId).pipe(Effect.provide(buildLayer()))
    )
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(String(exit.cause)).toContain('CannotFollowSelfError')
    }
  })

  it('should fail with UserNotFoundError when target does not exist', async () => {
    const exit = await Effect.runPromiseExit(
      unfollowUser('non-existent').pipe(Effect.provide(buildLayer()))
    )
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(String(exit.cause)).toContain('UserNotFoundError')
    }
  })

  it('should fail with NotFollowingError when not currently following', async () => {
    const exit = await Effect.runPromiseExit(
      unfollowUser(targetUser.id).pipe(Effect.provide(buildLayer()))
    )
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(String(exit.cause)).toContain('NotFollowingError')
    }
  })
})
