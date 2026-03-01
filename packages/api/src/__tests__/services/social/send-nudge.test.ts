import {
  mockFollowUser1,
  mockFollowUsers,
} from '@lily/api/__tests__/fixtures/follows'
import { createTestUser } from '@lily/api/__tests__/fixtures/users'
import { createMockFollowRepository } from '@lily/api/__tests__/mocks/follow.repository'
import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { sendNudge } from '@lily/api/services/social/endpoints/send-nudge'
import type { Notification } from '@lily/shared/notification'
import { Effect, Exit, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const currentUserId = 'user-1'
const targetUser = createTestUser({
  id: mockFollowUser1.id,
  name: 'Alice',
  publicProfile: true,
})

const buildLayer = (
  follows: Array<{
    followerId: string
    followingId: string
    createdAt: Date
  }> = [],
  nudges: Array<{
    fromUserId: string
    toUserId: string
    createdAt: Date
  }> = [],
  notifications: Notification[] = []
) =>
  Layer.mergeAll(
    createMockCurrentUser({ id: currentUserId, name: 'Current User' }),
    createMockFollowRepository({
      follows,
      nudges,
      users: mockFollowUsers,
    }),
    createMockUserRepository([targetUser]),
    createMockNotificationRepository(notifications),
    createMockMessageQueue()
  )

describe('sendNudge', () => {
  it('should send nudge notification to followed user', async () => {
    const notifications: Notification[] = []
    const layer = buildLayer(
      [
        {
          followerId: currentUserId,
          followingId: targetUser.id,
          createdAt: new Date(),
        },
      ],
      [],
      notifications
    )

    const result = await Effect.runPromise(
      sendNudge({ targetUserId: targetUser.id }).pipe(Effect.provide(layer))
    )
    expect(result).toEqual({ success: true })
  })

  it('should fail with UserNotFoundError for non-existent target', async () => {
    const exit = await Effect.runPromiseExit(
      sendNudge({ targetUserId: 'non-existent' }).pipe(
        Effect.provide(buildLayer())
      )
    )
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(String(exit.cause)).toContain('UserNotFoundError')
    }
  })

  it('should fail with NudgeNotAllowedError when not following target', async () => {
    const layer = buildLayer()

    const exit = await Effect.runPromiseExit(
      sendNudge({ targetUserId: targetUser.id }).pipe(Effect.provide(layer))
    )
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(String(exit.cause)).toContain('NudgeNotAllowedError')
    }
  })

  it('should fail with NudgeRateLimitError when nudged within last 24h', async () => {
    const layer = buildLayer(
      [
        {
          followerId: currentUserId,
          followingId: targetUser.id,
          createdAt: new Date(),
        },
      ],
      [
        {
          fromUserId: currentUserId,
          toUserId: targetUser.id,
          createdAt: new Date(), // just now
        },
      ]
    )

    const exit = await Effect.runPromiseExit(
      sendNudge({ targetUserId: targetUser.id }).pipe(Effect.provide(layer))
    )
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      expect(String(exit.cause)).toContain('NudgeRateLimitError')
    }
  })

  it('should allow nudge after 24h have passed', async () => {
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000)
    const layer = buildLayer(
      [
        {
          followerId: currentUserId,
          followingId: targetUser.id,
          createdAt: new Date(),
        },
      ],
      [
        {
          fromUserId: currentUserId,
          toUserId: targetUser.id,
          createdAt: twoDaysAgo,
        },
      ]
    )

    const result = await Effect.runPromise(
      sendNudge({ targetUserId: targetUser.id }).pipe(Effect.provide(layer))
    )
    expect(result).toEqual({ success: true })
  })

  it('should create notification with type nudge_to_water', async () => {
    const notifications: Notification[] = []
    const layer = buildLayer(
      [
        {
          followerId: currentUserId,
          followingId: targetUser.id,
          createdAt: new Date(),
        },
      ],
      [],
      notifications
    )

    await Effect.runPromise(
      sendNudge({ targetUserId: targetUser.id }).pipe(Effect.provide(layer))
    )
    expect(notifications).toHaveLength(1)
    expect(notifications[0]?.type).toBe('nudge_to_water')
    expect(notifications[0]?.userId).toBe(targetUser.id)
  })

  it('should include nudger name in notification body', async () => {
    const notifications: Notification[] = []
    const layer = buildLayer(
      [
        {
          followerId: currentUserId,
          followingId: targetUser.id,
          createdAt: new Date(),
        },
      ],
      [],
      notifications
    )

    await Effect.runPromise(
      sendNudge({ targetUserId: targetUser.id }).pipe(Effect.provide(layer))
    )
    expect(notifications[0]?.body).toContain('Current User')
  })
})
