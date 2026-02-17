import { createTestUser } from '@lily/api/__tests__/fixtures/users'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { createMockFollowRepository } from '@lily/api/__tests__/mocks/follow.repository'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { followUser } from '@lily/api/services/social/endpoints/follow-user'
import type { Notification } from '@lily/shared/notification'
import type { AppEvent } from '@lily/shared/server'
import { Effect, Exit, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const currentUserId = 'current-user'
const publicUser = createTestUser({
  id: 'public-user',
  name: 'Public User',
  publicProfile: true,
})
const privateUser = createTestUser({
  id: 'private-user',
  name: 'Private User',
  publicProfile: false,
})

const mockFollowUsers = [
  {
    id: publicUser.id,
    name: publicUser.name,
    image: publicUser.image,
    bio: publicUser.bio,
    plantCount: 5,
    publicProfile: true,
    shareGrowthData: true,
    createdAt: publicUser.createdAt,
  },
  {
    id: privateUser.id,
    name: privateUser.name,
    image: privateUser.image,
    bio: privateUser.bio,
    plantCount: 0,
    publicProfile: false,
    shareGrowthData: false,
    createdAt: privateUser.createdAt,
  },
]

const buildLayer = (
  follows: Array<{
    followerId: string
    followingId: string
    createdAt: Date
  }> = [],
  eventData: { publishedEvents: AppEvent[] } = { publishedEvents: [] },
  notifications: Notification[] = []
) =>
  Layer.mergeAll(
    createMockCurrentUser({ id: currentUserId }),
    createMockFollowRepository({
      follows,
      users: mockFollowUsers,
    }),
    createMockUserRepository([publicUser, privateUser]),
    createMockEventBus(eventData),
    createMockNotificationRepository(notifications)
  )

describe('followUser', () => {
  it('should follow a public user successfully', async () => {
    const result = await Effect.runPromise(
      followUser(publicUser.id).pipe(Effect.provide(buildLayer()))
    )
    expect(result).toEqual({ success: true })
  })

  it('should fail with CannotFollowSelfError when following self', async () => {
    const exit = await Effect.runPromiseExit(
      followUser(currentUserId).pipe(Effect.provide(buildLayer()))
    )
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(String(exit.cause)).toContain('CannotFollowSelfError')
    }
  })

  it('should fail with UserNotFoundError when target does not exist', async () => {
    const exit = await Effect.runPromiseExit(
      followUser('non-existent').pipe(Effect.provide(buildLayer()))
    )
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(String(exit.cause)).toContain('UserNotFoundError')
    }
  })

  it('should fail with UserNotPublicError when target profile is private', async () => {
    const exit = await Effect.runPromiseExit(
      followUser(privateUser.id).pipe(Effect.provide(buildLayer()))
    )
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(String(exit.cause)).toContain('UserNotPublicError')
    }
  })

  it('should fail with AlreadyFollowingError when already following', async () => {
    const layer = buildLayer([
      {
        followerId: currentUserId,
        followingId: publicUser.id,
        createdAt: new Date(),
      },
    ])

    const exit = await Effect.runPromiseExit(
      followUser(publicUser.id).pipe(Effect.provide(layer))
    )
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(String(exit.cause)).toContain('AlreadyFollowingError')
    }
  })

  it('should publish UserFollowed event on successful follow', async () => {
    const eventData = { publishedEvents: [] as AppEvent[] }
    const layer = buildLayer([], eventData)

    await Effect.runPromise(
      followUser(publicUser.id).pipe(Effect.provide(layer))
    )
    expect(eventData.publishedEvents).toHaveLength(1)
    expect(eventData.publishedEvents[0]?._tag).toBe('UserFollowed')
  })

  it('should create a notification for the followed user', async () => {
    const notifications: Notification[] = []
    const layer = buildLayer([], { publishedEvents: [] }, notifications)

    await Effect.runPromise(
      followUser(publicUser.id).pipe(Effect.provide(layer))
    )
    expect(notifications).toHaveLength(1)
    expect(notifications[0]?.type).toBe('new_follower')
    expect(notifications[0]?.userId).toBe(publicUser.id)
  })
})
