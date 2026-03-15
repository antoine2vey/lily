import { fireEvent, render, screen } from '@testing-library/react-native'
import { PlantFilters } from '../components/PlantFilters'

describe('PlantFilters', () => {
  const mockOnFilterChange = jest.fn()
  const defaultCounts = {
    all: 10,
    watering: 4,
    fertilizing: 2,
    needsAttention: 1,
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders all filter options', () => {
    render(
      <PlantFilters
        selectedFilter="all"
        onFilterChange={mockOnFilterChange}
        counts={defaultCounts}
      />
    )

    expect(screen.getByText('All (10)')).toBeTruthy()
    expect(screen.getByText('Needs Watering (4)')).toBeTruthy()
    expect(screen.getByText('Needs Fertilizing (2)')).toBeTruthy()
  })

  it('calls onFilterChange when watering filter is pressed', () => {
    render(
      <PlantFilters
        selectedFilter="all"
        onFilterChange={mockOnFilterChange}
        counts={defaultCounts}
      />
    )

    fireEvent.press(screen.getByText('Needs Watering (4)'))

    expect(mockOnFilterChange).toHaveBeenCalledWith('watering')
  })

  it('calls onFilterChange with fertilizing when fertilizing filter pressed', () => {
    render(
      <PlantFilters
        selectedFilter="all"
        onFilterChange={mockOnFilterChange}
        counts={defaultCounts}
      />
    )

    fireEvent.press(screen.getByText('Needs Fertilizing (2)'))

    expect(mockOnFilterChange).toHaveBeenCalledWith('fertilizing')
  })

  it('displays correct counts', () => {
    const customCounts = {
      all: 25,
      watering: 8,
      fertilizing: 3,
      needsAttention: 2,
    }

    render(
      <PlantFilters
        selectedFilter="all"
        onFilterChange={mockOnFilterChange}
        counts={customCounts}
      />
    )

    expect(screen.getByText('All (25)')).toBeTruthy()
    expect(screen.getByText('Needs Watering (8)')).toBeTruthy()
    expect(screen.getByText('Needs Fertilizing (3)')).toBeTruthy()
  })

  it('handles zero counts', () => {
    const zeroCounts = {
      all: 0,
      watering: 0,
      fertilizing: 0,
      needsAttention: 0,
    }

    render(
      <PlantFilters
        selectedFilter="all"
        onFilterChange={mockOnFilterChange}
        counts={zeroCounts}
      />
    )

    expect(screen.getByText('All (0)')).toBeTruthy()
    expect(screen.getByText('Needs Watering (0)')).toBeTruthy()
    expect(screen.getByText('Needs Fertilizing (0)')).toBeTruthy()
  })

  it('has testID for container', () => {
    render(
      <PlantFilters
        selectedFilter="all"
        onFilterChange={mockOnFilterChange}
        counts={defaultCounts}
      />
    )

    expect(screen.getByTestId('plant-filters')).toBeTruthy()
  })
})
