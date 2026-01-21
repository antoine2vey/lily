import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react-native'
import { describe, expect, it, vi } from 'vitest'

// Mock navigation
vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: vi.fn(),
    goBack: vi.fn(),
  }),
  useRoute: () => ({
    params: {
      plantId: 'plant-123',
    },
  }),
}))

import { CareHistoryScreen } from '../CareHistoryScreen'

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('CareHistoryScreen', () => {
  it('renders header with "Care History"', async () => {
    render(<CareHistoryScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Care History')).toBeTruthy()
    })
  })

  it('renders plant name in header', async () => {
    render(<CareHistoryScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Monstera Deliciosa')).toBeTruthy()
    })
  })

  it('renders filter button', async () => {
    render(<CareHistoryScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      // Filter icon should be rendered
      expect(screen.getByRole('button')).toBeTruthy()
    })
  })

  it('renders FAB for adding logs', async () => {
    render(<CareHistoryScreen />, { wrapper: createWrapper() })
    // FAB should be visible
    await waitFor(() => {
      expect(screen.getAllByRole('button').length).toBeGreaterThan(0)
    })
  })

  it('renders timeline with date groups', async () => {
    render(<CareHistoryScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Today')).toBeTruthy()
    })
  })

  it('renders care events', async () => {
    render(<CareHistoryScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Watered')).toBeTruthy()
    })
  })
})
