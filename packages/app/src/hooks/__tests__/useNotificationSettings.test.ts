import { waitFor } from '@testing-library/react-native'
import { renderQueryHook } from 'src/__tests__/utils/query-helpers'
import { useNotificationSettings } from '../useNotificationSettings'

jest.mock('src/utils/client', () => ({
  useEffectQuery: jest.fn().mockReturnValue({
    data: {
      name: 'Test User',
      email: 'test@example.com',
      notifications: {
        careReminders: true,
        weeklyDigest: true,
        achievements: true,
        tips: true,
        productUpdates: false,
        ads: false,
        doNotDisturb: false,
        doNotDisturbStart: '22:00',
        doNotDisturbEnd: '07:00',
      },
      timezone: 'UTC',
      preferredNotificationTime: '09:00',
    },
    isLoading: false,
    isSuccess: true,
  }),
  apiEffectRunner: jest.fn(),
}))

describe('useNotificationSettings', () => {
  it('returns notification settings from user settings', () => {
    const { result } = renderQueryHook(() => useNotificationSettings())

    expect(result.current.isLoading).toBe(false)
    expect(result.current.data).toBeDefined()
    expect(result.current.data?.careReminders).toBe(true)
  })

  it('returns doNotDisturb settings', () => {
    const { result } = renderQueryHook(() => useNotificationSettings())

    expect(result.current.data?.doNotDisturb).toBe(false)
    expect(result.current.data?.doNotDisturbStart).toBe('22:00')
    expect(result.current.data?.doNotDisturbEnd).toBe('07:00')
  })

  it('returns isSuccess when loaded', () => {
    const { result } = renderQueryHook(() => useNotificationSettings())

    expect(result.current.isSuccess).toBe(true)
  })
})
