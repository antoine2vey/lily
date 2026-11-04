import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import {
  dispatchNow,
  recordNotification,
  recordNotificationAt,
} from '@lily/api/services/helpers/schedule-notification'
import type { Notification } from '@lily/shared/notification'
import { QueueConnectionError, type QueueMessage } from '@lily/shared/server'
import { Array as Arr, Effect, Layer, References } from 'effect'
import { SqlError, UnknownError } from 'effect/sql/SqlError'
import { describe, expect, it } from 'vitest'

const recordAndDispatch = (
  notifications: Notification[],
  queue: ReturnType<typeof createMockMessageQueue>
) =>
  Effect.runPromise(
    recordNotification('new_follower', 'user-1', { senderName: 'Ada' }, 'en', {
      senderId: 'ada',
    }).pipe(
      Effect.flatMap(dispatchNow),
      Effect.provide(
        Layer.mergeAll(createMockNotificationRepository(notifications), queue)
      ),
      Effect.provideService(References.MinimumLogLevel, 'None')
    )
  )

describe('recordNotification', () => {
  it('inserts the row already queued so the scheduler cannot enqueue it again', async () => {
    const notifications: Notification[] = []

    await Effect.runPromise(
      recordNotification(
        'new_follower',
        'user-1',
        { senderName: 'Ada' },
        'en',
        { senderId: 'ada' }
      ).pipe(Effect.provide(createMockNotificationRepository(notifications)))
    )

    expect(
      Arr.map(notifications, (n) => [n.type, n.status, n.title, n.metadata])
    ).toEqual([
      ['new_follower', 'queued', '👋 New follower!', { senderId: 'ada' }],
    ])
  })

  it('enqueues nothing until the row is dispatched', async () => {
    const enqueued: QueueMessage[] = []

    await Effect.runPromise(
      recordNotification(
        'new_follower',
        'user-1',
        { senderName: 'Ada' },
        'en',
        { senderId: 'ada' }
      ).pipe(
        Effect.provide(
          Layer.mergeAll(
            createMockNotificationRepository([]),
            createMockMessageQueue({
              onEnqueue: (_, message) => enqueued.push(message),
            })
          )
        )
      )
    )

    expect(enqueued).toEqual([])
  })
})

describe('recordNotificationAt', () => {
  it('leaves the row pending at its time for the scheduler', async () => {
    const notifications: Notification[] = []
    const at = new Date('2026-11-05T08:30:00Z')

    await Effect.runPromise(
      recordNotificationAt(
        'photo_reminder',
        'user-1',
        { plantName: 'Fern', daysSincePhoto: 30 },
        'en',
        {},
        { scheduledAt: at, plantId: 'plant-1' }
      ).pipe(Effect.provide(createMockNotificationRepository(notifications)))
    )

    expect(
      Arr.map(notifications, (n) => [n.status, n.scheduledAt, n.plantId])
    ).toEqual([['pending', at, 'plant-1']])
  })
})

describe('dispatchNow', () => {
  it('enqueues the row on its own topic with its metadata', async () => {
    const notifications: Notification[] = []
    const enqueued: Array<{
      queue: string
      topic: string
      notificationIds: ReadonlyArray<string>
      metadata: QueueMessage['payload']['metadata']
    }> = []

    await recordAndDispatch(
      notifications,
      createMockMessageQueue({
        onEnqueue: (queue, message: QueueMessage) =>
          enqueued.push({
            queue,
            topic: message.topic,
            notificationIds: message.payload.notificationIds,
            metadata: message.payload.metadata,
          }),
      })
    )

    expect(enqueued).toEqual([
      {
        queue: 'new_follower',
        topic: 'new_follower',
        notificationIds: Arr.map(notifications, (n) => n.id),
        metadata: { senderId: 'ada' },
      },
    ])
  })

  it('hands the row to the scheduler when the queue is unavailable', async () => {
    const notifications: Notification[] = []

    await recordAndDispatch(
      notifications,
      createMockMessageQueue({
        enqueueFailure: new QueueConnectionError({ message: 'redis down' }),
      })
    )

    expect(Arr.map(notifications, (n) => n.status)).toEqual(['pending'])
  })

  it('succeeds and leaves the row queued for the sweep when the hand-back fails too', async () => {
    const notifications: Notification[] = []
    const releaseFails = Layer.effect(
      NotificationRepository,
      Effect.map(NotificationRepository, (repo) => ({
        ...repo,
        releaseUnclaimed: () =>
          Effect.fail(
            new SqlError({
              reason: new UnknownError({
                cause: new Error('db down'),
                message: 'db down',
              }),
            })
          ),
      }))
    ).pipe(Layer.provide(createMockNotificationRepository(notifications)))

    await Effect.runPromise(
      recordNotification(
        'new_follower',
        'user-1',
        { senderName: 'Ada' },
        'en',
        { senderId: 'ada' }
      ).pipe(
        Effect.flatMap(dispatchNow),
        Effect.provide(
          Layer.mergeAll(
            releaseFails,
            createMockMessageQueue({
              enqueueFailure: new QueueConnectionError({
                message: 'redis down',
              }),
            })
          )
        ),
        Effect.provideService(References.MinimumLogLevel, 'None')
      )
    )

    expect(Arr.map(notifications, (n) => n.status)).toEqual(['queued'])
  })
})
