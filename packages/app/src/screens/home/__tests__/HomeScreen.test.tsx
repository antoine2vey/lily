import { fireEvent, render, screen } from '@testing-library/react-native'
import { mockPlants } from '@/__tests__/fixtures/plants'

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

jest.mock('@/hooks/useCareAll', () => ({
  useCareAll: jest.fn(() => ({
    mutate: jest.fn(),
    isPending: false,
  })),
}))

jest.mock('@/hooks/useCareTasks', () => ({
  useCareTasks: jest.fn(() => ({
    data: {
      overdue: [],
      today: [
        {
          id: 'task-1',
          plantId: 'p1',
          plantName: 'Fern',
          plantImageUrl: null,
          roomName: null,
          roomIcon: null,
          type: 'watering',
          dueDate: new Date(),
          dueDayOffset: 0,
          localDueDate: '2026-06-03',
          completed: false,
        },
      ],
      upcoming: [],
      completedToday: 0,
      windowDays: [
        '2026-06-03',
        '2026-06-04',
        '2026-06-05',
        '2026-06-06',
        '2026-06-07',
        '2026-06-08',
        '2026-06-09',
        '2026-06-10',
      ],
    },
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

jest.mock('@/hooks/useWeather', () => ({
  useWeather: jest.fn(() => ({
    weatherEnabled: false,
    todayWeather: { _tag: 'None' },
    adjustmentSummary: {
      adjustedCount: 0,
      skipWateringCount: 0,
      skipFertilizationCount: 0,
    },
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  })),
}))

jest.mock('@/hooks/useWeatherSettings', () => ({
  useWeatherSettings: jest.fn(() => ({ data: { enabled: false } })),
  useToggleWeather: jest.fn(() => ({ mutate: jest.fn() })),
}))

jest.mock('@/hooks/useTemperatureUnit', () => ({
  useTemperatureUnit: jest.fn(() => ({
    unit: 'celsius',
    formatTemp: (c: number | null) =>
      c === null ? '--' : `${Math.round(c)}°C`,
  })),
}))

import { useAuth } from '@/contexts/AuthContext'
import { useEffectQuery } from '@/utils/client'
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

  it('renders home content when plants exist', () => {
    mockedUseEffectQuery.mockReturnValue({
      data: { items: mockPlants, total: mockPlants.length },
      isLoading: false,
      isRefetching: false,
      refetch: jest.fn(),
    })

    const { toJSON } = render(<HomeScreen />)
    expect(toJSON()).toBeTruthy()
  })

  it('renders add plant button in empty state', () => {
    mockedUseEffectQuery.mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
      isRefetching: false,
      refetch: jest.fn(),
    })

    render(<HomeScreen />)

    // Verify the add plant button exists and is pressable
    expect(screen.getByText('Add Your First Plant')).toBeTruthy()
    fireEvent.press(screen.getByText('Add Your First Plant'))
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
