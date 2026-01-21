import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react-native'
import { describe, expect, it, vi } from 'vitest'

// Mock navigation
vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    goBack: vi.fn(),
  }),
}))

import { AchievementsScreen } from '../AchievementsScreen'

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('AchievementsScreen', () => {
  it('renders header with title', async () => {
    render(<AchievementsScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Achievements')).toBeTruthy()
    })
  })

  it('renders level header', async () => {
    render(<AchievementsScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText(/Level/)).toBeTruthy()
    })
  })

  it('renders achievement count', async () => {
    render(<AchievementsScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText(/of.*achievements/)).toBeTruthy()
    })
  })

  it('renders Plant Collection category', async () => {
    render(<AchievementsScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Plant Collection')).toBeTruthy()
    })
  })

  it('renders Plant Care category', async () => {
    render(<AchievementsScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Plant Care')).toBeTruthy()
    })
  })

  it('renders Streaks category', async () => {
    render(<AchievementsScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Streaks')).toBeTruthy()
    })
  })

  it('renders achievement cards', async () => {
    render(<AchievementsScreen />, { wrapper: createWrapper() })
    await waitFor(() => {
      expect(screen.getByText('Plant Parent')).toBeTruthy()
    })
  })
})
