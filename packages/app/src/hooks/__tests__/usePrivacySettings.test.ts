import { renderQueryHook } from 'src/__tests__/utils/query-helpers'
import { usePrivacySettings } from '../usePrivacySettings'

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
      privacy: {
        publicProfile: true,
        shareGrowthData: true,
        personalizedTips: false,
      },
      timezone: 'UTC',
      preferredNotificationTime: '09:00',
    },
    isLoading: false,
    isSuccess: true,
  }),
  apiEffectRunner: jest.fn(),
}))

describe('usePrivacySettings', () => {
  it('returns privacy settings from user settings', () => {
    const { result } = renderQueryHook(() => usePrivacySettings())

    expect(result.current.isLoading).toBe(false)
    expect(result.current.data).toBeDefined()
    expect(result.current.data?.publicProfile).toBe(true)
    expect(result.current.data?.shareGrowthData).toBe(true)
    expect(result.current.data?.personalizedTips).toBe(false)
  })

  it('returns isSuccess when loaded', () => {
    const { result } = renderQueryHook(() => usePrivacySettings())

    expect(result.current.isSuccess).toBe(true)
  })
})
