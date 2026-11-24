import { createTestNotification } from '@lily/api/__tests__/fixtures/notifications'
import { mockUser1 } from '@lily/api/__tests__/fixtures/users'
import { createMockEventBus } from '@lily/api/__tests__/mocks/event-bus'
import { notificationMocks } from '@lily/api/__tests__/mocks/notification-table'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { acknowledgeCare } from '@lily/api/contexts/reminders/consumers'
import type { AppEvent } from '@lily/api/services/event-bus/types'
import { Effect, Layer } from 'effect'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const user = { ...mockUser1, timezone: 'America/Los_Angeles' }

const answersTo = async (sentAt: string, caredAt: string) => {
  vi.setSystemTime(new Date(caredAt))
  const publishedEvents: AppEvent[] = []
  await Effect.runPromise(
    acknowledgeCare({ plantId: 'plant-1', by: user.id }).pipe(
      Effect.provide(
        Layer.mergeAll(
          notificationMocks([
            createTestNotification({
              userId: user.id,
              plantId: 'plant-1',
              status: 'sent',
              sentAt: new Date(sentAt),
            }),
          ]).repository,
          createMockUserRepository([user]),
          createMockEventBus({ publishedEvents })
        )
      )
    )
  )
  return publishedEvents
}

describe('acknowledgeCare', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('counts an evening care as the answer to that morning reminder, past UTC midnight', async () => {
    const published = await answersTo(
      '2026-06-15T16:00:00.000Z',
      '2026-06-16T00:30:00.000Z'
    )

    expect(published).toEqual([
      { _tag: 'ReminderResponded', userId: user.id, plantId: 'plant-1' },
    ])
  })

  it('does not count a morning care as the answer to the reminder of the evening before', async () => {
    const published = await answersTo(
      '2026-06-15T04:00:00.000Z',
      '2026-06-15T16:00:00.000Z'
    )

    expect(published).toEqual([])
  })
})
