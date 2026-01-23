import { waitFor } from '@testing-library/react-native'
import { renderQueryHook } from 'src/__tests__/utils/query-helpers'
import { usePrivacySettings } from '../usePrivacySettings'

describe('usePrivacySettings', () => {
  it('returns loading state initially', () => {
    const { result } = renderQueryHook(() => usePrivacySettings())

    expect(result.current.isLoading).toBe(true)
  })

  it('returns settings data when successful', async () => {
    const { result } = renderQueryHook(() => usePrivacySettings())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.data).toBeDefined()
    expect(result.current.data?.publicProfile).toBe(false)
    expect(result.current.data?.shareGrowthData).toBe(true)
    expect(result.current.data?.personalizedTips).toBe(true)
  })

  it('returns isSuccess when loaded', async () => {
    const { result } = renderQueryHook(() => usePrivacySettings())

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
  })
})
