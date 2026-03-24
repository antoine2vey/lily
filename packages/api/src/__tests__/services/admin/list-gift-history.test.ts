import { createMockSubscriptionRepository } from '@lily/api/__tests__/mocks/subscription.repository'
import { SubscriptionRepository } from '@lily/api/repositories/subscription.repository'
import { listGiftHistory } from '@lily/api/services/admin/endpoints/list-gift-history'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

const mockGiftEvents = [
  {
    id: 'evt-1',
    userId: 'user-1',
    userName: 'Alice',
    userEmail: 'alice@example.com',
    eventType: 'subscription_gifted' as const,
    metadata: JSON.stringify({ giftedBy: 'admin-1', duration: '1m' }),
    createdAt: new Date('2026-03-01'),
  },
  {
    id: 'evt-2',
    userId: 'user-2',
    userName: null,
    userEmail: 'bob@example.com',
    eventType: 'subscription_gift_revoked' as const,
    metadata: JSON.stringify({ revokedBy: 'admin-1' }),
    createdAt: new Date('2026-03-02'),
  },
]

const createMockWithGiftEvents = (
  items: typeof mockGiftEvents,
  total: number
) => {
  const base = createMockSubscriptionRepository()
  return Layer.effect(
    SubscriptionRepository,
    Effect.map(SubscriptionRepository, (repo) => ({
      ...repo,
      findGiftEvents: () => Effect.succeed({ items, total }),
    }))
  ).pipe(Layer.provide(base))
}

describe('listGiftHistory', () => {
  it('should return paginated gift events', async () => {
    const result = await Effect.runPromise(
      listGiftHistory({ page: '1', limit: '20' }).pipe(
        Effect.provide(createMockWithGiftEvents(mockGiftEvents, 2))
      )
    )

    expect(result.items).toHaveLength(2)
    expect(result.total).toBe(2)
    expect(result.page).toBe(1)
    expect(result.hasMore).toBe(false)
    expect(result.items[0]?.eventType).toBe('subscription_gifted')
    expect(result.items[1]?.eventType).toBe('subscription_gift_revoked')
  })

  it('should return empty when no events exist', async () => {
    const result = await Effect.runPromise(
      listGiftHistory({ page: '1', limit: '20' }).pipe(
        Effect.provide(createMockWithGiftEvents([], 0))
      )
    )

    expect(result.items).toHaveLength(0)
    expect(result.total).toBe(0)
    expect(result.hasMore).toBe(false)
  })

  it('should indicate hasMore when more pages exist', async () => {
    const result = await Effect.runPromise(
      listGiftHistory({ page: '1', limit: '1' }).pipe(
        Effect.provide(createMockWithGiftEvents([mockGiftEvents[0]!], 2))
      )
    )

    expect(result.items).toHaveLength(1)
    expect(result.total).toBe(2)
    expect(result.hasMore).toBe(true)
  })
})
