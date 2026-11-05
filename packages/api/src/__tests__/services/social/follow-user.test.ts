import { createTestUser } from '@lily/api/__tests__/fixtures/users'
import {
  createMockEventBus,
  type MockEventBusData,
} from '@lily/api/__tests__/mocks/event-bus'
import { createMockFollowRepository } from '@lily/api/__tests__/mocks/follow.repository'
import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createOutboxTimeline } from '@lily/api/__tests__/mocks/outbox-timeline'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { MockSqlClientLive } from '@lily/api/__tests__/mocks/sql-client'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import type { FollowerNotification } from '@lily/api/repositories/follow.repository'
import { followUser } from '@lily/api/services/social/endpoints/follow-user'
import type { AppEvent, QueueMessage } from '@lily/shared/server'
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
  eventData: MockEventBusData = { publishedEvents: [] },
  options: {
    readonly onFollow?: (
      followerId: string,
      followingId: string,
      notification: FollowerNotification
    ) => void
    readonly onEnqueue?: (topic: string, message: QueueMessage) => void
    readonly timeline?: ReturnType<typeof createOutboxTimeline>
  } = {}
) =>
  Layer.mergeAll(
    options.timeline?.sql ?? MockSqlClientLive,
    createMockCurrentUser({ id: currentUserId }),
    createMockFollowRepository({
      follows,
      users: mockFollowUsers,
      onFollow: options.onFollow ?? (() => {}),
    }),
    createMockUserRepository([publicUser, privateUser]),
    createMockEventBus(eventData),
    createMockNotificationRepository([], options.timeline?.notificationOptions),
    options.timeline?.queue ??
      createMockMessageQueue({ onEnqueue: options.onEnqueue ?? (() => {}) })
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

  it('records the follower notification with the follow and pushes the recorded id', async () => {
    const recorded: Array<{
      followingId: string
      notification: FollowerNotification
    }> = []
    const enqueued: QueueMessage[] = []
    const layer = buildLayer([], undefined, {
      onFollow: (_, followingId, notification) =>
        recorded.push({ followingId, notification }),
      onEnqueue: (_, message) => enqueued.push(message),
    })

    await Effect.runPromise(
      followUser(publicUser.id).pipe(Effect.provide(layer))
    )

    expect(recorded).toEqual([
      {
        followingId: publicUser.id,
        notification: {
          title: '👋 New follower!',
          body: 'Test User started following your plant journey',
          params: { senderName: 'Test User' },
          metadata: { senderId: currentUserId },
        },
      },
    ])
    expect(enqueued).toHaveLength(1)
    expect(enqueued[0]?.topic).toBe('new_follower')
    expect(enqueued[0]?.payload).toMatchObject({
      userId: publicUser.id,
      notificationIds: [`notification-${publicUser.id}`],
      metadata: { senderId: currentUserId },
    })
  })

  it('writes the follow and its notification in one statement, then pushes before publishing', async () => {
    const timeline = createOutboxTimeline()
    const layer = buildLayer(
      [],
      {
        publishedEvents: [],
        onPublish: (event) => timeline.record(`publish ${event._tag}`),
      },
      {
        onFollow: (_, followingId) => timeline.record(`follow ${followingId}`),
        timeline,
      }
    )

    await Effect.runPromise(
      followUser(publicUser.id).pipe(Effect.provide(layer))
    )

    expect(timeline.events).toEqual([
      `follow ${publicUser.id}`,
      `enqueue new_follower ${publicUser.id}`,
      'publish UserFollowed',
    ])
  })
})
