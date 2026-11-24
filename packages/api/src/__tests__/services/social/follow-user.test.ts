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
import { FollowRepository } from '@lily/api/repositories/follow.repository'
import { followUser } from '@lily/api/services/social/endpoints/follow-user'
import type { Notification } from '@lily/shared/notification'
import type { AppEvent, QueueMessage } from '@lily/shared/server'
import { failureOf } from '@lily/shared/testing'
import { Effect, Layer } from 'effect'
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
    readonly onFollow?: (followerId: string, followingId: string) => void
    readonly notifications?: Notification[]
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
    createMockNotificationRepository(
      options.notifications ?? [],
      options.timeline?.notificationOptions
    ),
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
    expect(failureOf(exit)._tag).toBe('CannotFollowSelfError')
  })

  it('should fail with UserNotFoundError when target does not exist', async () => {
    const exit = await Effect.runPromiseExit(
      followUser('non-existent').pipe(Effect.provide(buildLayer()))
    )
    expect(failureOf(exit)._tag).toBe('UserNotFoundError')
  })

  it('should fail with UserNotPublicError when target profile is private', async () => {
    const exit = await Effect.runPromiseExit(
      followUser(privateUser.id).pipe(Effect.provide(buildLayer()))
    )
    expect(failureOf(exit)._tag).toBe('UserNotPublicError')
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
    expect(failureOf(exit)._tag).toBe('AlreadyFollowingError')
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

  it('records one queued follower notification for a new follow and pushes its id', async () => {
    const notifications: Notification[] = []
    const enqueued: QueueMessage[] = []
    const layer = buildLayer([], undefined, {
      notifications,
      onEnqueue: (_, message) => enqueued.push(message),
    })

    await Effect.runPromise(
      followUser(publicUser.id).pipe(Effect.provide(layer))
    )

    expect(notifications).toEqual([
      expect.objectContaining({
        type: 'new_follower',
        userId: publicUser.id,
        status: 'queued',
        title: '👋 New follower!',
        body: 'Test User started following your plant journey',
        params: { senderName: 'Test User' },
        metadata: { senderId: currentUserId },
      }),
    ])
    expect(notifications[0]?.plantId).toBeUndefined()
    expect(enqueued.map((message) => [message.topic, message.payload])).toEqual(
      [
        [
          'new_follower',
          {
            userId: publicUser.id,
            notificationIds: [notifications[0]?.id],
            plantIds: [],
            metadata: { senderId: currentUserId },
          },
        ],
      ]
    )
  })

  it('records no notification when the caller already follows the user', async () => {
    const notifications: Notification[] = []
    const enqueued: QueueMessage[] = []
    const layer = buildLayer(
      [
        {
          followerId: currentUserId,
          followingId: publicUser.id,
          createdAt: new Date(),
        },
      ],
      undefined,
      { notifications, onEnqueue: (_, message) => enqueued.push(message) }
    )

    const exit = await Effect.runPromiseExit(
      followUser(publicUser.id).pipe(Effect.provide(layer))
    )

    expect(failureOf(exit)._tag).toBe('AlreadyFollowingError')
    expect(notifications).toEqual([])
    expect(enqueued).toEqual([])
  })

  it('records no notification when a concurrent request inserted the follow first', async () => {
    const notifications: Notification[] = []
    const eventData = { publishedEvents: [] as AppEvent[] }
    const timeline = createOutboxTimeline()
    const layer = buildLayer(
      [
        {
          followerId: currentUserId,
          followingId: publicUser.id,
          createdAt: new Date(),
        },
      ],
      eventData,
      { notifications, timeline }
    )
    const checkedBeforeTheOtherInsert = Layer.effect(
      FollowRepository,
      Effect.gen(function* () {
        const follows = yield* FollowRepository
        return { ...follows, isFollowing: () => Effect.succeed(false) }
      })
    )

    const exit = await Effect.runPromiseExit(
      followUser(publicUser.id).pipe(
        Effect.provide(
          checkedBeforeTheOtherInsert.pipe(Layer.provideMerge(layer))
        )
      )
    )

    expect(failureOf(exit)).toMatchObject({
      _tag: 'SqlError',
      reason: { _tag: 'UniqueViolation' },
    })
    expect(notifications).toEqual([])
    expect(timeline.events).toEqual(['begin', 'rollback'])
    expect(eventData.publishedEvents).toEqual([])
  })

  it('commits the follow with its notification, then pushes before publishing', async () => {
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
      'begin',
      `follow ${publicUser.id}`,
      `insert new_follower ${publicUser.id}`,
      'commit',
      `enqueue new_follower ${publicUser.id}`,
      'publish UserFollowed',
    ])
  })
})
