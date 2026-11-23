import { act, waitFor } from '@testing-library/react-native'
import { ok, stubApi } from '@/__tests__/utils/fake-api'
import {
  afterApiRequest,
  renderQueryHook,
} from '@/__tests__/utils/query-helpers'
import { useSubscription } from '@/hooks/useSubscription'
import { useSubscriptionSync } from '@/hooks/useSubscriptionSync'

const tier = (name: 'free' | 'paid') => ({
  subscription: null,
  usage: null,
  tierConfig: {
    tier: name,
    name,
    priceMonthly: name === 'paid' ? 2.99 : 0,
    maxPlants: name === 'paid' ? null : 5,
    maxAiChatsMonthly: null,
    maxCardScansMonthly: null,
    maxPlantIdentifiesMonthly: null,
  },
})

describe('useSubscriptionSync', () => {
  it('shows the tier the API reports after a purchase', async () => {
    let current = tier('free')
    const api = stubApi(({ method, path }) =>
      method === 'GET' && path === '/subscriptions/current'
        ? ok(current)
        : undefined
    )
    const { result } = renderQueryHook(() => ({
      tier: useSubscription().data?.tierConfig.tier,
      sync: useSubscriptionSync(),
    }))
    await waitFor(
      () => expect(result.current.tier).toBe('free'),
      afterApiRequest
    )

    current = tier('paid')
    act(() => result.current.sync.syncSubscription())

    await waitFor(
      () => expect(result.current.tier).toBe('paid'),
      afterApiRequest
    )
    expect(api.sent.map(({ method, path }) => `${method} ${path}`)).toEqual([
      'GET /subscriptions/current',
      'GET /subscriptions/current',
    ])
  })
})
