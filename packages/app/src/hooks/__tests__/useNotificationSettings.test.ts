import { waitFor } from '@testing-library/react-native'
import { renderQueryHook } from 'src/__tests__/utils/query-helpers'
import { useNotificationSettings } from '../useNotificationSettings'

describe('useNotificationSettings', () => {
  it('returns loading state initially', () => {
    const { result } = renderQueryHook(() => useNotificationSettings())

    expect(result.current.isLoading).toBe(true)
  })

  it('returns settings data when successful', async () => {
    const { result } = renderQueryHook(() => useNotificationSettings())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.data).toBeDefined()
    expect(result.current.data?.careReminders).toBe(true)
    expect(result.current.data?.reminderTime).toBe('09:00')
  })

  it('returns doNotDisturb settings', async () => {
    const { result } = renderQueryHook(() => useNotificationSettings())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.data?.doNotDisturb).toBe(false)
    expect(result.current.data?.doNotDisturbStart).toBe('22:00')
    expect(result.current.data?.doNotDisturbEnd).toBe('07:00')
  })

  it('returns isSuccess when loaded', async () => {
    const { result } = renderQueryHook(() => useNotificationSettings())

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
  })
})
