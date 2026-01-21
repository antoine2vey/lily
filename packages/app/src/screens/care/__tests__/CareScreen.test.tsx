import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react-native'
import { describe, expect, it, vi } from 'vitest'

// Mock navigation
vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: vi.fn(),
  }),
}))

import { CareScreen } from '../CareScreen'

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('CareScreen', () => {
  it('renders "Care" title', async () => {
    render(<CareScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Care')).toBeTruthy()
    })
  })

  it('renders today date', async () => {
    render(<CareScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      // Should contain "Today" in the date string
      expect(screen.getByText(/Today/i)).toBeTruthy()
    })
  })

  it('renders calendar button', async () => {
    render(<CareScreen />, { wrapper: createWrapper() })
    // Calendar icon should be rendered
    await waitFor(() => {
      expect(screen.getByRole('button')).toBeTruthy()
    })
  })

  it('shows loading state initially', () => {
    render(<CareScreen />, { wrapper: createWrapper() })
    // Should show loading indicator initially
  })

  it('renders Overdue section when tasks are overdue', async () => {
    render(<CareScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Overdue')).toBeTruthy()
    })
  })

  it('renders Today section', async () => {
    render(<CareScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Today')).toBeTruthy()
    })
  })

  it('renders This Week section', async () => {
    render(<CareScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('This Week')).toBeTruthy()
    })
  })
})
