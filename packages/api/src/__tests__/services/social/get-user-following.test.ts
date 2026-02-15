import { mockFollowUsers } from '@lily/api/__tests__/fixtures/follows'
import { createTestUser } from '@lily/api/__tests__/fixtures/users'
import { createMockFollowRepository } from '@lily/api/__tests__/mocks/follow.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { getUserFollowing } from '@lily/api/services/social/endpoints/get-user-following'
import { Effect, Exit, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const currentUserId = 'user-1'
const publicUser = createTestUser({
  id: 'follow-user-1',
  name: 'Alice',
  publicProfile: true,
})
const privateUser = createTestUser({
  id: 'private-user-1',
  name: 'Private Pete',
  publicProfile: false,
})

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
    createMockUserRepository([publicUser, privateUser])
  )

describe('getUserFollowing', () => {
  it('should return following list of a public user', async () => {
    const layer = buildLayer([
      {
        followerId: publicUser.id,
        followingId: currentUserId,
        createdAt: new Date(),
      },
    ])

    const result = await Effect.runPromise(
      getUserFollowing(publicUser.id, {}).pipe(Effect.provide(layer))
    )
    expect(result.items).toBeDefined()
    expect(result.total).toBeDefined()
    expect(result.page).toBe(1)
  })

  it('should fail with UserNotFoundError for non-existent user', async () => {
    const exit = await Effect.runPromiseExit(
      getUserFollowing('non-existent', {}).pipe(Effect.provide(buildLayer()))
    )
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(String(exit.cause)).toContain('UserNotFoundError')
    }
  })

  it('should fail with UserNotPublicError for private user', async () => {
    const exit = await Effect.runPromiseExit(
      getUserFollowing(privateUser.id, {}).pipe(Effect.provide(buildLayer()))
    )
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(String(exit.cause)).toContain('UserNotPublicError')
    }
  })
})
