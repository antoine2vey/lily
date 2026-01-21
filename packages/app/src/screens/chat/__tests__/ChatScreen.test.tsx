import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react-native'
import { describe, expect, it, vi } from 'vitest'

// Mock navigation
vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    goBack: vi.fn(),
  }),
  useRoute: () => ({
    params: {},
  }),
}))

// Mock expo-image-picker
vi.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: vi.fn().mockResolvedValue({ canceled: true }),
  launchCameraAsync: vi.fn().mockResolvedValue({ canceled: true }),
  requestCameraPermissionsAsync: vi
    .fn()
    .mockResolvedValue({ status: 'granted' }),
}))

import { ChatScreen } from '../ChatScreen'

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('ChatScreen', () => {
  it('renders chat header', async () => {
    render(<ChatScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Lily Assistant')).toBeTruthy()
    })
  })

  it('renders online status', async () => {
    render(<ChatScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Online')).toBeTruthy()
    })
  })

  it('fetches message history', async () => {
    render(<ChatScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      // Should show messages from history
      expect(screen.getByText(/I'm Lily/)).toBeTruthy()
    })
  })

  it('renders input at bottom', async () => {
    render(<ChatScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(
        screen.getByPlaceholderText('Ask about plant care...')
      ).toBeTruthy()
    })
  })

  it('renders user messages', async () => {
    render(<ChatScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText(/Monstera leaves turning brown/)).toBeTruthy()
    })
  })

  it('renders assistant messages', async () => {
    render(<ChatScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText(/brown tips/)).toBeTruthy()
    })
  })
})
