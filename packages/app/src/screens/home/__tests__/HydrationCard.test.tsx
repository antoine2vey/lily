import { fireEvent, render, screen } from '@testing-library/react-native'
import { HydrationCard } from '../components/HydrationCard'

describe('HydrationCard', () => {
  const mockPlants = [
    { id: '1', name: 'Monstera', imageUrl: 'https://example.com/monstera.jpg' },
    { id: '2', name: 'Fern', imageUrl: undefined },
    { id: '3', name: 'Cactus', imageUrl: 'https://example.com/cactus.jpg' },
  ]

  const mockOnWaterAll = jest.fn()
  const mockOnPlantPress = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders nothing when no plants need water', () => {
    const { toJSON } = render(
      <HydrationCard
        plants={[]}
        onWaterAll={mockOnWaterAll}
        onPlantPress={mockOnPlantPress}
      />
    )

    expect(toJSON()).toBeNull()
  })

  it('displays title and plant count', () => {
    render(
      <HydrationCard
        plants={mockPlants}
        onWaterAll={mockOnWaterAll}
        onPlantPress={mockOnPlantPress}
      />
    )

    expect(screen.getByText('Hydration Time')).toBeTruthy()
    expect(screen.getByText('3 plants need water today')).toBeTruthy()
  })

  it('shows singular text for one plant', () => {
    render(
      <HydrationCard
        plants={[mockPlants[0]]}
        onWaterAll={mockOnWaterAll}
        onPlantPress={mockOnPlantPress}
      />
    )

    expect(screen.getByText('1 plant needs water today')).toBeTruthy()
  })

  it('displays plant names', () => {
    render(
      <HydrationCard
        plants={mockPlants}
        onWaterAll={mockOnWaterAll}
        onPlantPress={mockOnPlantPress}
      />
    )

    expect(screen.getByText('Monstera')).toBeTruthy()
    expect(screen.getByText('Fern')).toBeTruthy()
    expect(screen.getByText('Cactus')).toBeTruthy()
  })

  it('shows +N indicator when more than 3 plants', () => {
    const manyPlants = [
      ...mockPlants,
      { id: '4', name: 'Aloe' },
      { id: '5', name: 'Snake Plant' },
    ]

    render(
      <HydrationCard
        plants={manyPlants}
        onWaterAll={mockOnWaterAll}
        onPlantPress={mockOnPlantPress}
      />
    )

    expect(screen.getByText('+2')).toBeTruthy()
  })

  it('calls onPlantPress when plant is pressed', () => {
    render(
      <HydrationCard
        plants={mockPlants}
        onWaterAll={mockOnWaterAll}
        onPlantPress={mockOnPlantPress}
      />
    )

    fireEvent.press(screen.getByLabelText('View Monstera'))

    expect(mockOnPlantPress).toHaveBeenCalledWith('1')
  })

  it('calls onWaterAll when water all button pressed', () => {
    render(
      <HydrationCard
        plants={mockPlants}
        onWaterAll={mockOnWaterAll}
        onPlantPress={mockOnPlantPress}
      />
    )

    fireEvent.press(screen.getByText('Water All'))

    expect(mockOnWaterAll).toHaveBeenCalled()
  })

  it('has accessible water all button', () => {
    render(
      <HydrationCard
        plants={mockPlants}
        onWaterAll={mockOnWaterAll}
        onPlantPress={mockOnPlantPress}
      />
    )

    expect(screen.getByLabelText('Water all plants')).toBeTruthy()
  })
})
