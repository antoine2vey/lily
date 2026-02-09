import { render, waitFor } from '@testing-library/react-native'

// Mock dependencies
jest.mock('@/hooks/useNotificationSettings', () => ({
  useNotificationSettings: jest.fn(),
  useUpdateNotificationSettings: jest.fn(),
}))

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: jest.fn(),
}))

jest.mock('@/utils/client', () => ({
  apiEffectRunner: jest.fn().mockResolvedValue({ timezone: 'UTC' }),
}))

// Mock notifications utilities
jest.mock('@/utils/notifications', () => ({
  getDeviceTimezone: jest.fn(() => 'UTC'),
  getExpoPushToken: jest.fn().mockResolvedValue('mock-push-token'),
  getPlatform: jest.fn().mockReturnValue('ios'),
}))

import { useAuth } from 'src/contexts/AuthContext'
import {
  useNotificationSettings,
  useUpdateNotificationSettings,
} from 'src/hooks/useNotificationSettings'
import { NotificationSettingsScreen } from '../NotificationSettingsScreen'

const mockedUseNotificationSettings = useNotificationSettings as jest.Mock
const mockedUseUpdateNotificationSettings =
  useUpdateNotificationSettings as jest.Mock
const mockedUseAuth = useAuth as jest.Mock

describe('NotificationSettingsScreen', () => {
  const mockUpdateSettings = jest.fn()

  const defaultSettings = {
    careReminders: true,
    reminderTime: '09:00',
    weeklyDigest: true,
    achievements: true,
    tips: false,
    productUpdates: false,
    doNotDisturb: false,
    doNotDisturbStart: '22:00',
    doNotDisturbEnd: '07:00',
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockedUseUpdateNotificationSettings.mockReturnValue({
      mutate: mockUpdateSettings,
    })
    mockedUseAuth.mockReturnValue({
      state: {
        _tag: 'Authenticated',
        user: { id: 'user-1', email: 'test@example.com' },
      },
    })
  })

  it('renders loading state', async () => {
    mockedUseNotificationSettings.mockReturnValue({
      data: undefined,
      isLoading: true,
    })

    const { toJSON } = render(<NotificationSettingsScreen />)

    await waitFor(() => {
      expect(toJSON()).toBeTruthy()
    })
  })

  it('renders with settings data', async () => {
    mockedUseNotificationSettings.mockReturnValue({
      data: defaultSettings,
      isLoading: false,
    })

    const { toJSON } = render(<NotificationSettingsScreen />)

    await waitFor(() => {
      expect(toJSON()).toBeTruthy()
    })
  })
})
