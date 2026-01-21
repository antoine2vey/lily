import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react-native'
import { describe, expect, it, vi } from 'vitest'

// Mock navigation
vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    goBack: vi.fn(),
  }),
}))

// Mock DateTimePicker
vi.mock('@react-native-community/datetimepicker', () => ({
  default: () => null,
}))

import { NotificationSettingsScreen } from '../NotificationSettingsScreen'

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('NotificationSettingsScreen', () => {
  it('renders header with title', async () => {
    render(<NotificationSettingsScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Notification Settings')).toBeTruthy()
    })
  })

  it('renders Care Reminders section', async () => {
    render(<NotificationSettingsScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Care Reminders')).toBeTruthy()
    })
  })

  it('renders care reminders toggle', async () => {
    render(<NotificationSettingsScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(
        screen.getByText("Get reminded when it's time to water or fertilize")
      ).toBeTruthy()
    })
  })

  it('renders Updates & Alerts section', async () => {
    render(<NotificationSettingsScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Updates & Alerts')).toBeTruthy()
    })
  })

  it('renders Weekly Digest toggle', async () => {
    render(<NotificationSettingsScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Weekly Digest')).toBeTruthy()
    })
  })

  it('renders Achievements toggle', async () => {
    render(<NotificationSettingsScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Achievements')).toBeTruthy()
    })
  })

  it('renders Do Not Disturb section', async () => {
    render(<NotificationSettingsScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Do Not Disturb')).toBeTruthy()
    })
  })
})
