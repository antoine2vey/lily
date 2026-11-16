import { Result } from 'effect'
import { mockUserSettings } from '@/__tests__/fixtures'
import {
  afterApiRequest,
  createCacheTestQueryClient,
} from '@/__tests__/utils/query-helpers'
import {
  act,
  fireEvent,
  renderWithQuery,
  screen,
  waitFor,
} from '@/__tests__/utils/render'

const fetchMock = jest.spyOn(globalThis, 'fetch')
afterEach(() => fetchMock.mockReset())

jest.mock('sonner-native', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}))

jest.mock('@/hooks/useNotificationSettings', () => ({
  useNotificationSettings: jest.fn(),
  useUpdateNotificationSettings: jest.fn(),
}))

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: jest.fn(),
}))

jest.mock('@/utils/notifications', () => ({
  getDeviceTimezone: jest.fn(() => 'Europe/Paris'),
  getExpoPushToken: jest.fn().mockResolvedValue('mock-push-token'),
  getPlatform: jest.fn().mockReturnValue('ios'),
}))

import { toast } from 'sonner-native'
import { useAuth } from '@/contexts/AuthContext'
import {
  useNotificationSettings,
  useUpdateNotificationSettings,
} from '@/hooks/useNotificationSettings'
import { NotificationSettingsScreen } from '../NotificationSettingsScreen'

const mockedUseNotificationSettings = useNotificationSettings as jest.Mock
const mockedUseUpdateNotificationSettings =
  useUpdateNotificationSettings as jest.Mock
const mockedUseAuth = useAuth as jest.Mock

const renderScreen = () => {
  const queryClient = createCacheTestQueryClient()
  queryClient.setQueryData(
    ['users', 'getUserSettings', {}],
    Result.succeed(mockUserSettings)
  )
  return renderWithQuery(<NotificationSettingsScreen />, { queryClient })
}

describe('NotificationSettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedUseUpdateNotificationSettings.mockReturnValue({ mutate: jest.fn() })
    mockedUseNotificationSettings.mockReturnValue({
      data: mockUserSettings.notifications,
      isLoading: false,
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

    const { toJSON } = renderScreen()

    await waitFor(() => {
      expect(toJSON()).toBeTruthy()
    })
  })

  it('shows the saved timezone from the user settings', () => {
    renderScreen()

    expect(screen.getByText('New York (ET)')).toBeTruthy()
  })

  it('shows the detected timezone before the API answers', async () => {
    fetchMock.mockReturnValue(new Promise(() => {}))
    renderScreen()

    act(() => {
      fireEvent.press(screen.getByText('Auto-detect Timezone'))
    })

    await waitFor(
      () => expect(screen.getByText('Paris (CET)')).toBeTruthy(),
      afterApiRequest
    )
    expect(screen.queryByText('New York (ET)')).toBeNull()
  }, 15000)

  it('restores the saved timezone and says so when saving fails', async () => {
    // The save fails; the refetch that follows returns the saved settings.
    fetchMock
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockImplementation(
        async () =>
          new Response(JSON.stringify(mockUserSettings), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
      )
    renderScreen()

    act(() => {
      fireEvent.press(screen.getByText('Auto-detect Timezone'))
    })

    await waitFor(
      () =>
        expect(toast.error).toHaveBeenCalledWith(
          "Couldn't save your change. Try again."
        ),
      afterApiRequest
    )
    expect(fetchMock).toHaveBeenCalled()
    await waitFor(
      () => expect(screen.getByText('New York (ET)')).toBeTruthy(),
      afterApiRequest
    )
  }, 15000)
})
