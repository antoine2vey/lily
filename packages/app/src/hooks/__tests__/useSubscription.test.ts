import { mockNow } from '@/__tests__/utils/dates'

jest.mock('@/utils/client', () => ({
  useEffectQuery: jest.fn().mockReturnValue({
    data: {
      subscription: {
        id: 'sub_123',
        userId: 'user_1',
        tier: 'paid',
        status: 'active',
        currentPeriodStart: mockNow(),
        currentPeriodEnd: mockNow(),
        trialStartsAt: null,
        trialEndsAt: null,
        canceledAt: null,
        createdAt: mockNow(),
        updatedAt: mockNow(),
      },
      usage: {
        aiChatsCount: 5,
        cardScansCount: 2,
        plantIdentifiesCount: 3,
      },
      tierConfig: {
        tier: 'paid',
        name: 'Premium',
        priceMonthly: 4.99,
        maxPlants: null,
        maxAiChatsMonthly: null,
        maxCardScansMonthly: null,
        maxPlantIdentifiesMonthly: null,
      },
    },
    isLoading: false,
    isSuccess: true,
  }),
  apiEffectRunner: jest.fn(),
}))

import { renderQueryHook } from '@/__tests__/utils/query-helpers'
import { useSubscription } from '../useSubscription'

describe('useSubscription', () => {
  it('returns subscription data when successful', () => {
    const { result } = renderQueryHook(() => useSubscription())

    expect(result.current.isLoading).toBe(false)
    expect(result.current.data).toBeDefined()
    expect(result.current.data?.tierConfig.tier).toBe('paid')
    expect(result.current.data?.subscription?.status).toBe('active')
  })

  it('returns isSuccess when loaded', () => {
    const { result } = renderQueryHook(() => useSubscription())

    expect(result.current.isSuccess).toBe(true)
  })
})
