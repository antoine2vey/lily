import { mockPlants } from '@lily/api/__tests__/fixtures/plants'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { mockFixedDate } from 'src/__tests__/utils/dates'

// Mock dependencies
jest.mock('expo-router', () => ({
  router: {
    back: jest.fn(),
    push: jest.fn(),
  },
  useLocalSearchParams: jest.fn(() => ({ plantId: 'plant-1' })),
}))

jest.mock('@/hooks/usePlant', () => ({
  usePlant: jest.fn(),
}))

jest.mock('@/hooks/useCareHistory', () => ({
  useCareHistory: jest.fn(),
}))

jest.mock('@/hooks/usePlants', () => ({
  usePlants: jest.fn(() => ({
    data: { items: [], total: 0 },
    isLoading: false,
  })),
}))

jest.mock('@/hooks/useSaveCareLog', () => ({
  useSaveCareLog: jest.fn(() => ({
    mutate: jest.fn(),
    isPending: false,
  })),
}))

import { useCareHistory } from '@/hooks/useCareHistory'
import { usePlant } from '@/hooks/usePlant'
import { CareHistoryScreen } from '../CareHistoryScreen'

const mockedUsePlant = usePlant as jest.Mock
const mockedUseCareHistory = useCareHistory as jest.Mock

describe('CareHistoryScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedUsePlant.mockReturnValue({
      data: mockPlants[0],
    })
  })

  it('shows loading state initially', () => {
    mockedUseCareHistory.mockReturnValue({
      data: undefined,
      isLoading: true,
    })

    render(<CareHistoryScreen />)

    expect(screen.getByTestId('activity-indicator')).toBeTruthy()
  })

  it('displays care history title', () => {
    mockedUseCareHistory.mockReturnValue({
      data: [],
      isLoading: false,
    })

    render(<CareHistoryScreen />)

    expect(screen.getByText('Care History')).toBeTruthy()
  })

  it('displays plant name subtitle', () => {
    mockedUseCareHistory.mockReturnValue({
      data: [],
      isLoading: false,
    })

    render(<CareHistoryScreen />)

    expect(screen.getByText(mockPlants[0].name)).toBeTruthy()
  })

  it('shows empty state when no history', () => {
    mockedUseCareHistory.mockReturnValue({
      data: [],
      isLoading: false,
    })

    render(<CareHistoryScreen />)

    expect(screen.getByText('No care history')).toBeTruthy()
    expect(
      screen.getByText('Start logging care activities to see them here')
    ).toBeTruthy()
  })

  it('displays filter button', () => {
    mockedUseCareHistory.mockReturnValue({
      data: [],
      isLoading: false,
    })

    render(<CareHistoryScreen />)

    expect(screen.getByTestId('filter-button')).toBeTruthy()
  })

  it('displays add log FAB', () => {
    mockedUseCareHistory.mockReturnValue({
      data: [],
      isLoading: false,
    })

    render(<CareHistoryScreen />)

    expect(screen.getByTestId('add-log-fab')).toBeTruthy()
  })

  it('opens filter sheet when filter button pressed', () => {
    mockedUseCareHistory.mockReturnValue({
      data: [],
      isLoading: false,
    })

    render(<CareHistoryScreen />)

    fireEvent.press(screen.getByTestId('filter-button'))

    expect(screen.getByText('Filter by Type')).toBeTruthy()
    expect(screen.getByText('All')).toBeTruthy()
    expect(screen.getByText('Water')).toBeTruthy()
    expect(screen.getByText('Fertilize')).toBeTruthy()
  })

  it('displays timeline when history exists', () => {
    const historyData = [
      {
        date: '2024-01-15',
        events: [
          {
            id: '1',
            type: 'water',
            timestamp: mockFixedDate(2024, 1, 15, 10, 0),
          },
        ],
      },
    ]

    mockedUseCareHistory.mockReturnValue({
      data: historyData,
      isLoading: false,
    })

    render(<CareHistoryScreen />)

    expect(screen.getByTestId('timeline')).toBeTruthy()
  })
})
