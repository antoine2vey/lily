import { mockPlants } from '@lily/api/__tests__/fixtures/plants'
import { fireEvent, render, screen } from '@testing-library/react-native'

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

import { useAuth } from '@/contexts/AuthContext'
import { useEffectQuery } from '@/utils/client'
import { HomeScreen } from '../HomeScreen'

const mockedUseEffectQuery = useEffectQuery as jest.MockedFunction<
  typeof useEffectQuery
>
const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>

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

  it('shows stats row when plants exist', () => {
    mockedUseEffectQuery.mockReturnValue({
      data: { items: mockPlants, total: mockPlants.length },
      isLoading: false,
      isRefetching: false,
      refetch: jest.fn(),
    })

    render(<HomeScreen />)

    expect(screen.getByText('Total')).toBeTruthy()
    expect(screen.getByText('Healthy')).toBeTruthy()
    expect(screen.getByText('Attention')).toBeTruthy()
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

    expect(screen.getByText('Add Plant')).toBeTruthy()
    expect(screen.getByText('Scan with AI')).toBeTruthy()
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
