import { fireEvent, render, screen } from '@testing-library/react-native'
import { mockPlants } from 'src/__tests__/fixtures/plants'

// Mock dependencies
jest.mock('@/utils/client', () => ({
  useEffectQuery: jest.fn(),
}))

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: jest.fn(),
}))

jest.mock('@/hooks/useRecentActivities', () => ({
  useRecentActivities: jest.fn(() => ({
    data: [],
    isLoading: false,
  })),
}))

jest.mock('@/hooks/useCareTasks', () => ({
  useCareTasks: jest.fn(() => ({
    data: { overdue: [], today: [], upcoming: [] },
    isLoading: false,
    refetch: jest.fn(),
  })),
}))

jest.mock('@/hooks/useAchievements', () => ({
  useAchievements: jest.fn(() => ({
    data: undefined,
    isLoading: false,
    refetch: jest.fn(),
  })),
}))

jest.mock('@/hooks/useCareAll', () => ({
  useCareAll: jest.fn(() => ({
    mutate: jest.fn(),
    isPending: false,
  })),
}))

jest.mock('@/hooks/useCompleteTask', () => ({
  useCompleteTask: jest.fn(() => ({
    mutate: jest.fn(),
    isPending: false,
  })),
}))

import { useAuth } from 'src/contexts/AuthContext'
import { useEffectQuery } from 'src/utils/client'
import { HomeScreen } from '../HomeScreen'

const mockedUseEffectQuery = useEffectQuery as jest.Mock
const mockedUseAuth = useAuth as jest.Mock

describe('HomeScreen', () => {
  const mockLogout = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    mockedUseAuth.mockReturnValue({
      state: {
        _tag: 'Authenticated',
        user: { id: 'user-1', name: 'Test User', email: 'test@example.com' },
      },
      logout: mockLogout,
      login: jest.fn(),
    })
  })

  it('renders loading state', () => {
    mockedUseEffectQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isRefetching: false,
      refetch: jest.fn(),
    })

    const { toJSON } = render(<HomeScreen />)
    expect(toJSON()).toBeTruthy()
  })

  it('displays greeting with user name', () => {
    mockedUseEffectQuery.mockReturnValue({
      data: { items: mockPlants, total: mockPlants.length },
      isLoading: false,
      isRefetching: false,
      refetch: jest.fn(),
    })

    render(<HomeScreen />)

    expect(screen.getByText(/Test User/)).toBeTruthy()
  })

  it('shows empty state when no plants', () => {
    mockedUseEffectQuery.mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
      isRefetching: false,
      refetch: jest.fn(),
    })

    render(<HomeScreen />)

    expect(screen.getByText('Your garden awaits')).toBeTruthy()
    expect(screen.getByText('Add Your First Plant')).toBeTruthy()
  })

  it('shows care agenda when plants exist', () => {
    mockedUseEffectQuery.mockReturnValue({
      data: { items: mockPlants, total: mockPlants.length },
      isLoading: false,
      isRefetching: false,
      refetch: jest.fn(),
    })

    render(<HomeScreen />)

    expect(screen.getByText('All done for today!')).toBeTruthy()
    expect(screen.getByText('Your plants are happy')).toBeTruthy()
  })

  it('opens add plant bottom sheet when button pressed', () => {
    mockedUseEffectQuery.mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
      isRefetching: false,
      refetch: jest.fn(),
    })

    render(<HomeScreen />)

    fireEvent.press(screen.getByText('Add Your First Plant'))

    // Verify the sheet opens with translated content
    expect(screen.getByText('Add Plant')).toBeTruthy()
    expect(screen.getByText('Identify with AI')).toBeTruthy()
    expect(screen.getByText('Add manually')).toBeTruthy()
  })

  it('uses default name when user has no name', () => {
    mockedUseAuth.mockReturnValue({
      state: {
        _tag: 'Authenticated',
        user: { id: 'user-1', email: 'test@example.com' },
      },
      logout: mockLogout,
      login: jest.fn(),
    })

    mockedUseEffectQuery.mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
      isRefetching: false,
      refetch: jest.fn(),
    })

    render(<HomeScreen />)

    expect(screen.getByText(/Gardener/)).toBeTruthy()
  })
})
