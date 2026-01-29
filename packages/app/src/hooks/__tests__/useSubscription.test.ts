import { waitFor } from '@testing-library/react-native'
import { renderQueryHook } from 'src/__tests__/utils/query-helpers'
import { useSubscription } from '../useSubscription'

describe('useSubscription', () => {
  it('returns loading state initially', () => {
    const { result } = renderQueryHook(() => useSubscription())

    expect(result.current.isLoading).toBe(true)
  })

  it('returns subscription data when successful', async () => {
    const { result } = renderQueryHook(() => useSubscription())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.data).toBeDefined()
    expect(result.current.data?.tierConfig.tier).toBe('paid')
    expect(result.current.data?.subscription?.status).toBe('active')
  })

  it('returns isSuccess when loaded', async () => {
    const { result } = renderQueryHook(() => useSubscription())

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
  })
})
