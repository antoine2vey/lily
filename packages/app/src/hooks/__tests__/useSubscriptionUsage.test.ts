import { waitFor } from '@testing-library/react-native'
import { renderQueryHook } from 'src/__tests__/utils/query-helpers'
import { useSubscriptionUsage } from '../useSubscriptionUsage'

describe('useSubscriptionUsage', () => {
  it('returns loading state initially', () => {
    const { result } = renderQueryHook(() => useSubscriptionUsage())

    expect(result.current.isLoading).toBe(true)
  })

  it('returns usage data when successful', async () => {
    const { result } = renderQueryHook(() => useSubscriptionUsage())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.data).toBeDefined()
    expect(result.current.data?.planName).toBe('Lily Free')
    expect(result.current.data?.usage).toHaveLength(3)
  })

  it('returns isPremium flag', async () => {
    const { result } = renderQueryHook(() => useSubscriptionUsage())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.data?.isPremium).toBe(false)
  })

  it('returns status', async () => {
    const { result } = renderQueryHook(() => useSubscriptionUsage())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.data?.status).toBe('active')
  })
})
