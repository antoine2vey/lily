import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native'
import { PlantsScreen } from '../PlantsScreen'

// Mock the router
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}))

// Mock the client hook
const mockPlants = {
  items: [
    {
      id: 'plant-1',
      name: 'Monstera',
      imageUrl: 'https://example.com/monstera.jpg',
      health: 'HEALTHY',
      nextWateringAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    },
    {
      id: 'plant-2',
      name: 'Fiddle Leaf Fig',
      imageUrl: 'https://example.com/fiddle.jpg',
      health: 'NEEDS_ATTENTION',
      nextWateringAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    },
    {
      id: 'plant-3',
      name: 'Snake Plant',
      imageUrl: null,
      health: 'THRIVING',
      nextWateringAt: null,
    },
  ],
  total: 3,
  page: 1,
  limit: 50,
  hasMore: false,
}

const mockUseEffectQuery = jest.fn()

jest.mock('src/utils/client', () => ({
  useEffectQuery: (...args: unknown[]) => mockUseEffectQuery(...args),
}))

describe('PlantsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders "My Plants" title', async () => {
    mockUseEffectQuery.mockReturnValue({
      data: mockPlants,
      isLoading: false,
    })

    render(<PlantsScreen />)
    await waitFor(() => {
      expect(screen.getByText('My Plants')).toBeTruthy()
    })
  })

  it('renders search icon', async () => {
    mockUseEffectQuery.mockReturnValue({
      data: mockPlants,
      isLoading: false,
    })

    render(<PlantsScreen />)
    await waitFor(() => {
      expect(screen.getByTestId('search-button')).toBeTruthy()
    })
  })

  it('renders view toggle icon', async () => {
    mockUseEffectQuery.mockReturnValue({
      data: mockPlants,
      isLoading: false,
    })

    render(<PlantsScreen />)
    await waitFor(() => {
      expect(screen.getByTestId('view-toggle')).toBeTruthy()
    })
  })

  it('renders plants in grid', async () => {
    mockUseEffectQuery.mockReturnValue({
      data: mockPlants,
      isLoading: false,
    })

    render(<PlantsScreen />)
    await waitFor(() => {
      expect(screen.getByTestId('plants-grid')).toBeTruthy()
      expect(screen.getByText('Monstera')).toBeTruthy()
      expect(screen.getByText('Fiddle Leaf Fig')).toBeTruthy()
      expect(screen.getByText('Snake Plant')).toBeTruthy()
    })
  })

  it('shows loading state while fetching', () => {
    mockUseEffectQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
    })

    render(<PlantsScreen />)
    expect(screen.getByTestId('loading-indicator')).toBeTruthy()
  })

  it('shows filter chips with counts', async () => {
    mockUseEffectQuery.mockReturnValue({
      data: mockPlants,
      isLoading: false,
    })

    render(<PlantsScreen />)
    await waitFor(() => {
      expect(screen.getByText('All (3)')).toBeTruthy()
      expect(screen.getByText('Healthy (2)')).toBeTruthy()
      expect(screen.getByText('Needs Attention (1)')).toBeTruthy()
    })
  })

  it('shows search bar when search button pressed', async () => {
    mockUseEffectQuery.mockReturnValue({
      data: mockPlants,
      isLoading: false,
    })

    render(<PlantsScreen />)
    await waitFor(() => {
      expect(screen.getByTestId('search-button')).toBeTruthy()
    })

    fireEvent.press(screen.getByTestId('search-button'))

    await waitFor(() => {
      expect(screen.getByTestId('plant-search-bar')).toBeTruthy()
    })
  })

  it('filters plants by search query', async () => {
    mockUseEffectQuery.mockReturnValue({
      data: mockPlants,
      isLoading: false,
    })

    render(<PlantsScreen />)

    // Open search
    fireEvent.press(screen.getByTestId('search-button'))

    await waitFor(() => {
      expect(screen.getByTestId('search-input')).toBeTruthy()
    })

    // Type search query
    fireEvent.changeText(screen.getByTestId('search-input'), 'Monstera')

    await waitFor(() => {
      expect(screen.getByText('Monstera')).toBeTruthy()
      expect(screen.queryByText('Fiddle Leaf Fig')).toBeNull()
    })
  })

  it('renders empty state when no plants', async () => {
    mockUseEffectQuery.mockReturnValue({
      data: { items: [], total: 0, page: 1, limit: 50, hasMore: false },
      isLoading: false,
    })

    render(<PlantsScreen />)
    await waitFor(() => {
      expect(screen.getByText('No plants yet')).toBeTruthy()
      expect(
        screen.getByText(
          'Start building your collection by adding your first plant'
        )
      ).toBeTruthy()
    })
  })

  it('shows sort options when sort button pressed', async () => {
    mockUseEffectQuery.mockReturnValue({
      data: mockPlants,
      isLoading: false,
    })

    render(<PlantsScreen />)

    fireEvent.press(screen.getByTestId('sort-button'))

    await waitFor(() => {
      expect(screen.getByText('Name (A-Z)')).toBeTruthy()
      expect(screen.getByText('Recently Added')).toBeTruthy()
    })
  })
})
