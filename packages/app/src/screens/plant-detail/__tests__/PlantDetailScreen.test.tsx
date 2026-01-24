import { mockPlants } from '@lily/api/__tests__/fixtures/plants'
import { fireEvent, render, screen } from '@testing-library/react-native'

// Mock dependencies
jest.mock('sonner-native', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    dismiss: jest.fn(),
  },
}))

jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(() => ({ plantId: 'plant-1' })),
  useRouter: jest.fn(() => ({
    back: jest.fn(),
    push: jest.fn(),
  })),
}))

jest.mock('@/utils/client', () => ({
  useEffectQuery: jest.fn(),
}))

jest.mock('@/hooks/useUploadPhoto', () => ({
  useUploadPhoto: () => ({
    mutate: jest.fn(),
    isPending: false,
  }),
}))

jest.mock('@/hooks/useWaterPlant', () => ({
  useWaterPlant: () => ({
    mutate: jest.fn(),
    isPending: false,
  }),
}))

jest.mock('@/hooks/useFertilizePlant', () => ({
  useFertilizePlant: () => ({
    mutate: jest.fn(),
    isPending: false,
  }),
}))

jest.mock('@/hooks/useDeletePlant', () => ({
  useDeletePlant: () => ({
    mutate: jest.fn(),
    isPending: false,
  }),
}))

jest.mock('@/hooks/useDeletePhoto', () => ({
  useDeletePhoto: () => ({
    mutate: jest.fn(),
    isPending: false,
  }),
}))

import { useEffectQuery } from '@/utils/client'
import { PlantDetailScreen } from '../PlantDetailScreen'

const mockedUseEffectQuery = useEffectQuery as jest.MockedFunction<
  typeof useEffectQuery
>

describe('PlantDetailScreen', () => {
  const mockPlant = {
    ...mockPlants[0],
    health: 'HEALTHY',
    lightingRating: 5,
    wateringRating: 5,
    humidityRating: 5,
    nextWateringAt: new Date(
      Date.now() + 2 * 24 * 60 * 60 * 1000
    ).toISOString(),
    nextFertilizationAt: new Date(
      Date.now() + 14 * 24 * 60 * 60 * 1000
    ).toISOString(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('shows loading skeleton when loading', () => {
    mockedUseEffectQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: jest.fn(),
    })

    render(<PlantDetailScreen />)

    expect(screen.getByTestId('plant-detail-skeleton')).toBeTruthy()
  })

  it('shows error state when error occurs', () => {
    mockedUseEffectQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Failed to load'),
      refetch: jest.fn(),
    })

    render(<PlantDetailScreen />)

    expect(screen.getByTestId('plant-detail-error')).toBeTruthy()
    expect(screen.getByText('Failed to load plant')).toBeTruthy()
    expect(screen.getByText('Try Again')).toBeTruthy()
  })

  it('displays plant name', () => {
    mockedUseEffectQuery.mockReturnValue({
      data: mockPlant,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    })

    render(<PlantDetailScreen />)

    expect(screen.getByText(mockPlant.name)).toBeTruthy()
  })

  it('displays plant image when available', () => {
    const plantWithImage = {
      ...mockPlant,
      imageUrl: 'https://example.com/plant.jpg',
    }

    mockedUseEffectQuery.mockReturnValue({
      data: plantWithImage,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    })

    render(<PlantDetailScreen />)

    expect(screen.getByTestId('plant-hero-image')).toBeTruthy()
  })

  it('displays placeholder when no image', () => {
    const plantWithoutImage = {
      ...mockPlant,
      imageUrl: null,
    }

    mockedUseEffectQuery.mockReturnValue({
      data: plantWithoutImage,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    })

    render(<PlantDetailScreen />)

    expect(screen.getByTestId('plant-hero-placeholder')).toBeTruthy()
  })

  it('displays quick actions', () => {
    mockedUseEffectQuery.mockReturnValue({
      data: mockPlant,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    })

    render(<PlantDetailScreen />)

    // "Water" and "Fertilize" appear in multiple places (quick actions + care schedule)
    expect(screen.getAllByText('Water').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Fertilize').length).toBeGreaterThan(0)
    expect(screen.getByText('Photo')).toBeTruthy()
    expect(screen.getByText('Chat')).toBeTruthy()
  })

  it('displays care schedule section', () => {
    mockedUseEffectQuery.mockReturnValue({
      data: mockPlant,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    })

    render(<PlantDetailScreen />)

    expect(screen.getByText('Care Schedule')).toBeTruthy()
  })

  it('displays ideal environment section', () => {
    mockedUseEffectQuery.mockReturnValue({
      data: mockPlant,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    })

    render(<PlantDetailScreen />)

    expect(screen.getByText('Ideal Environment')).toBeTruthy()
  })

  it('displays back button', () => {
    mockedUseEffectQuery.mockReturnValue({
      data: mockPlant,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    })

    render(<PlantDetailScreen />)

    expect(screen.getByTestId('back-button')).toBeTruthy()
  })

  it('displays more options button', () => {
    mockedUseEffectQuery.mockReturnValue({
      data: mockPlant,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    })

    render(<PlantDetailScreen />)

    expect(screen.getByTestId('more-options-button')).toBeTruthy()
  })

  it('opens options sheet when more button is pressed', () => {
    mockedUseEffectQuery.mockReturnValue({
      data: mockPlant,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    })

    render(<PlantDetailScreen />)

    fireEvent.press(screen.getByTestId('more-options-button'))

    expect(screen.getByText('Edit Plant Details')).toBeTruthy()
    expect(screen.getByText('Delete Plant')).toBeTruthy()
  })

  it('shows delete confirmation when delete is selected', () => {
    mockedUseEffectQuery.mockReturnValue({
      data: mockPlant,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
    })

    render(<PlantDetailScreen />)

    fireEvent.press(screen.getByTestId('more-options-button'))
    fireEvent.press(screen.getByText('Delete Plant'))

    expect(screen.getByText(`Delete ${mockPlant.name}?`)).toBeTruthy()
  })

  it('calls refetch when retry is pressed on error', () => {
    const mockRefetch = jest.fn()
    mockedUseEffectQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Failed'),
      refetch: mockRefetch,
    })

    render(<PlantDetailScreen />)

    fireEvent.press(screen.getByText('Try Again'))

    expect(mockRefetch).toHaveBeenCalled()
  })
})
