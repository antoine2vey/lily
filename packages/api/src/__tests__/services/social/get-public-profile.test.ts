import {
  mockFollowUser1,
  mockFollowUser1Plants,
  mockFollowUsers,
  mockPrivateUser,
} from '@lily/api/__tests__/fixtures/follows'
import { createMockFollowRepository } from '@lily/api/__tests__/mocks/follow.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { getPublicProfile } from '@lily/api/services/social/endpoints/get-public-profile'
import { Effect, Exit, Layer } from 'effect'
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

describe('getPublicProfile', () => {
  it('should return public profile with counts for a public user', async () => {
    const result = await Effect.runPromise(
      getPublicProfile(mockFollowUser1.id).pipe(Effect.provide(buildLayer()))
    )
    expect(result.id).toBe(mockFollowUser1.id)
    expect(result.name).toBe(mockFollowUser1.name)
    expect(result.plantCount).toBe(mockFollowUser1.plantCount)
    expect(result.followerCount).toBe(0)
    expect(result.followingCount).toBe(0)
  })

  it('should include isFollowing=true when currently following', async () => {
    const layer = buildLayer([
      {
        followerId: currentUserId,
        followingId: mockFollowUser1.id,
        createdAt: new Date(),
      },
    ])

    const result = await Effect.runPromise(
      getPublicProfile(mockFollowUser1.id).pipe(Effect.provide(layer))
    )
    expect(result.isFollowing).toBe(true)
  })

  it('should include isFollowing=false when not following', async () => {
    const result = await Effect.runPromise(
      getPublicProfile(mockFollowUser1.id).pipe(Effect.provide(buildLayer()))
    )
    expect(result.isFollowing).toBe(false)
  })

  it('should fail with UserNotFoundError for non-existent user', async () => {
    const exit = await Effect.runPromiseExit(
      getPublicProfile('non-existent').pipe(Effect.provide(buildLayer()))
    )
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(String(exit.cause)).toContain('UserNotFoundError')
    }
  })

  it('should fail with UserNotPublicError for private user', async () => {
    const exit = await Effect.runPromiseExit(
      getPublicProfile(mockPrivateUser.id).pipe(Effect.provide(buildLayer()))
    )
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(String(exit.cause)).toContain('UserNotPublicError')
    }
  })

  it('should include shareGrowthData flag', async () => {
    const result = await Effect.runPromise(
      getPublicProfile(mockFollowUser1.id).pipe(Effect.provide(buildLayer()))
    )
    expect(result.shareGrowthData).toBe(mockFollowUser1.shareGrowthData)
  })

  it('should include recentPlants from the user', async () => {
    const result = await Effect.runPromise(
      getPublicProfile(mockFollowUser1.id).pipe(Effect.provide(buildLayer()))
    )
    expect(result.recentPlants).toEqual(mockFollowUser1Plants)
  })

  it('should return empty recentPlants for user with no plants', async () => {
    const result = await Effect.runPromise(
      getPublicProfile('follow-user-3').pipe(Effect.provide(buildLayer()))
    )
    expect(result.recentPlants).toEqual([])
  })
})
