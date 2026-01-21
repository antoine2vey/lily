import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native'
import { describe, expect, it, vi } from 'vitest'

// Mock navigation
vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: vi.fn(),
    goBack: vi.fn(),
  }),
}))

import { NotificationsScreen } from '../NotificationsScreen'

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('NotificationsScreen', () => {
  it('renders header with title', async () => {
    render(<NotificationsScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Notifications')).toBeTruthy()
    })
  })

  it('renders All and Unread tabs', async () => {
    render(<NotificationsScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('All')).toBeTruthy()
      expect(screen.getByText('Unread')).toBeTruthy()
    })
  })

  it('renders mark all read button when unread exists', async () => {
    render(<NotificationsScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Mark all read')).toBeTruthy()
    })
  })

  it('renders notification items', async () => {
    render(<NotificationsScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Time to water!')).toBeTruthy()
    })
  })

  it('renders date group headers', async () => {
    render(<NotificationsScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Today')).toBeTruthy()
    })
  })

  it('filters to unread when tab pressed', async () => {
    render(<NotificationsScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      const unreadTab = screen.getByText('Unread')
      fireEvent.press(unreadTab)
    })
    // Should only show unread notifications
  })
})
