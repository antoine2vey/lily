import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { scheduleSimpleNotification } from '@lily/api/services/helpers/schedule-notification'
import type { Notification } from '@lily/shared/notification'
import { QueueConnectionError, type QueueMessage } from '@lily/shared/server'
import { Array as Arr, Effect, Layer, References } from 'effect'
import { describe, expect, it } from 'vitest'

const schedule = (
  notifications: Notification[],
  queue: ReturnType<typeof createMockMessageQueue>
) =>
  Effect.runPromise(
    scheduleSimpleNotification(
      'new_follower',
      'user-1',
      { senderName: 'Ada' },
      'en',
      { senderId: 'ada' }
    ).pipe(
      Effect.provide(
        Layer.mergeAll(createMockNotificationRepository(notifications), queue)
      ),
      Effect.provideService(References.MinimumLogLevel, 'None')
    )
  )

describe('scheduleSimpleNotification', () => {
  it('inserts the row already queued so the scheduler cannot enqueue it again', async () => {
    const notifications: Notification[] = []
    const statusAtEnqueue: string[] = []

    await schedule(
      notifications,
      createMockMessageQueue({
        onEnqueue: (_, message: QueueMessage) =>
          statusAtEnqueue.push(
            ...Arr.map(
              Arr.filter(notifications, (n) =>
                Arr.contains(message.payload.notificationIds, n.id)
              ),
              (n) => n.status
            )
          ),
      })
    )

    expect(statusAtEnqueue).toEqual(['queued'])
    expect(Arr.map(notifications, (n) => n.status)).toEqual(['queued'])
  })

  it('hands the row to the scheduler when the queue is unavailable', async () => {
    const notifications: Notification[] = []

    await schedule(
      notifications,
      createMockMessageQueue({
        enqueueFailure: new QueueConnectionError({ message: 'redis down' }),
      })
    )

    expect(Arr.map(notifications, (n) => n.status)).toEqual(['pending'])
  })

  it('stores the metadata on the row the scheduler would resend', async () => {
    const notifications: Notification[] = []

    await Effect.runPromise(
      scheduleSimpleNotification(
        'delegation_request',
        'user-1',
        { senderName: 'Ada' },
        'en',
        { delegationId: 'delegation-a' }
      ).pipe(
        Effect.provide(
          Layer.mergeAll(
            createMockNotificationRepository(notifications),
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

    expect(Arr.map(notifications, (n) => n.metadata)).toEqual([
      { delegationId: 'delegation-a' },
    ])
  })
})
