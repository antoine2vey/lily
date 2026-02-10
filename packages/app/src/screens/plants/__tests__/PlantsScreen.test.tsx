import { fireEvent, render, screen } from '@testing-library/react-native'
import { mockPlants } from 'src/__tests__/fixtures/plants'
import { mockIsoString } from 'src/__tests__/utils/dates'

// Mock dependencies
jest.mock('src/utils/client', () => ({
  useEffectQuery: jest.fn(),
}))

jest.mock('src/hooks/useDelayedLoading', () => ({
  useDelayedLoading: (isLoading: boolean) => isLoading,
}))

jest.mock('src/hooks/useRooms', () => ({
  useRooms: () => ({ data: undefined, isLoading: false }),
}))

import { useEffectQuery } from 'src/utils/client'
import { PlantsScreen } from '../PlantsScreen'

const mockedUseEffectQuery = useEffectQuery as jest.Mock

describe('PlantsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('shows skeleton when loading', () => {
    mockedUseEffectQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
    })

    render(<PlantsScreen />)

    expect(screen.getByTestId('plants-screen-skeleton')).toBeTruthy()
  })

  it('shows empty state when no plants', () => {
    mockedUseEffectQuery.mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
    })

    render(<PlantsScreen />)

    expect(screen.getByText('My Plants')).toBeTruthy()
    expect(screen.getByText('No plants yet')).toBeTruthy()
    expect(screen.getByText('Add Your First Plant')).toBeTruthy()
  })

  it('displays plants list when plants exist', () => {
    const plantsWithHealth = mockPlants.map((p) => ({
      ...p,
      health: 'HEALTHY',
      nextWateringAt: mockIsoString(),
    }))

    mockedUseEffectQuery.mockReturnValue({
      data: { items: plantsWithHealth, total: plantsWithHealth.length },
      isLoading: false,
    })

    render(<PlantsScreen />)

    expect(screen.getByText('My Plants')).toBeTruthy()
    expect(screen.getByTestId('plants-grid')).toBeTruthy()
  })

  it('shows search button', () => {
    const plantsWithHealth = mockPlants.map((p) => ({
      ...p,
      health: 'HEALTHY',
      nextWateringAt: mockIsoString(),
    }))

    mockedUseEffectQuery.mockReturnValue({
      data: { items: plantsWithHealth, total: plantsWithHealth.length },
      isLoading: false,
    })

    render(<PlantsScreen />)

    expect(screen.getByTestId('search-button')).toBeTruthy()
  })

  it('shows sort button', () => {
    const plantsWithHealth = mockPlants.map((p) => ({
      ...p,
      health: 'HEALTHY',
      nextWateringAt: mockIsoString(),
    }))

    mockedUseEffectQuery.mockReturnValue({
      data: { items: plantsWithHealth, total: plantsWithHealth.length },
      isLoading: false,
    })

    render(<PlantsScreen />)

    expect(screen.getByTestId('sort-button')).toBeTruthy()
  })

  it('toggles search bar visibility', () => {
    const plantsWithHealth = mockPlants.map((p) => ({
      ...p,
      health: 'HEALTHY',
      nextWateringAt: mockIsoString(),
    }))

    mockedUseEffectQuery.mockReturnValue({
      data: { items: plantsWithHealth, total: plantsWithHealth.length },
      isLoading: false,
    })

    render(<PlantsScreen />)

    // Search bar should not be visible initially
    expect(screen.queryByTestId('plant-search-bar')).toBeNull()

    // Click search button to show search bar
    fireEvent.press(screen.getByTestId('search-button'))

    expect(screen.getByTestId('plant-search-bar')).toBeTruthy()
  })

  it('displays filter chips', () => {
    const plantsWithHealth = mockPlants.map((p) => ({
      ...p,
      health: 'HEALTHY',
      nextWateringAt: mockIsoString(),
    }))

    mockedUseEffectQuery.mockReturnValue({
      data: { items: plantsWithHealth, total: plantsWithHealth.length },
      isLoading: false,
    })

    render(<PlantsScreen />)

    // Filters show count in parentheses, e.g., "All (3)"
    expect(screen.getByText(/All \(\d+\)/)).toBeTruthy()
    expect(screen.getByText(/Healthy \(\d+\)/)).toBeTruthy()
    expect(screen.getByText(/Needs Attention \(\d+\)/)).toBeTruthy()
  })

  it('opens sort options sheet when sort button pressed', () => {
    const plantsWithHealth = mockPlants.map((p) => ({
      ...p,
      health: 'HEALTHY',
      nextWateringAt: mockIsoString(),
    }))

    mockedUseEffectQuery.mockReturnValue({
      data: { items: plantsWithHealth, total: plantsWithHealth.length },
      isLoading: false,
    })

    render(<PlantsScreen />)

    fireEvent.press(screen.getByTestId('sort-button'))

    expect(screen.getByText('Sort by')).toBeTruthy()
  })

  it('opens add plant sheet in empty state', () => {
    mockedUseEffectQuery.mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
    })

    render(<PlantsScreen />)

    fireEvent.press(screen.getByText('Add Your First Plant'))

    // AddPlantOptionsSheet uses translations
    expect(screen.getByText('Identify with AI')).toBeTruthy()
    expect(screen.getByText('Add manually')).toBeTruthy()
  })

  it('shows empty state when search has no results', () => {
    const plantsWithHealth = [
      {
        id: '1',
        name: 'Monstera',
        health: 'HEALTHY',
        nextWateringAt: mockIsoString(),
      },
    ]

    mockedUseEffectQuery.mockReturnValue({
      data: { items: plantsWithHealth, total: 1 },
      isLoading: false,
    })

    render(<PlantsScreen />)

    // Open search and enter non-matching query
    fireEvent.press(screen.getByTestId('search-button'))
    fireEvent.changeText(screen.getByTestId('plant-search-bar'), 'nonexistent')

    expect(screen.getByText('No plants found')).toBeTruthy()
  })
})
