jest.mock('src/utils/client', () => ({
  useEffectQuery: jest.fn().mockReturnValue({
    data: {
      subscription: {
        id: 'sub_123',
        userId: 'user_1',
        tier: 'free',
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        trialStartsAt: null,
        trialEndsAt: null,
        canceledAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      usage: {
        aiChatsCount: 5,
        cardScansCount: 2,
        plantIdentifiesCount: 3,
      },
      tierConfig: {
        tier: 'free',
        name: 'Lily Free',
        priceMonthly: 0,
        maxPlants: 3,
        maxAiChatsMonthly: 10,
        maxCardScansMonthly: 5,
        maxPlantIdentifiesMonthly: 5,
      },
    },
    isLoading: false,
    isSuccess: true,
  }),
  apiEffectRunner: jest.fn(),
}))

import { renderQueryHook } from 'src/__tests__/utils/query-helpers'
import { useSubscriptionUsage } from '../useSubscriptionUsage'

describe('useSubscriptionUsage', () => {
  it('returns usage data when successful', () => {
    const { result } = renderQueryHook(() => useSubscriptionUsage())

    expect(result.current.isLoading).toBe(false)
    expect(result.current.data).toBeDefined()
    expect(result.current.data?.planName).toBe('Lily Free')
    expect(result.current.data?.usage).toHaveLength(3)
  })

  it('returns isPremium flag', () => {
    const { result } = renderQueryHook(() => useSubscriptionUsage())

    expect(result.current.data?.isPremium).toBe(false)
  })

  it('returns status', () => {
    const { result } = renderQueryHook(() => useSubscriptionUsage())

    expect(result.current.data?.status).toBe('active')
  })
})
