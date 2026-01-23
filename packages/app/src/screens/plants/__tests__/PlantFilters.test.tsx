import { fireEvent, render, screen } from '@testing-library/react-native'
import { PlantFilters } from '../components/PlantFilters'

describe('PlantFilters', () => {
  const mockOnFilterChange = jest.fn()
  const defaultCounts = {
    all: 10,
    healthy: 7,
    attention: 3,
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
    expect(screen.getByText('Healthy (7)')).toBeTruthy()
    expect(screen.getByText('Needs Attention (3)')).toBeTruthy()
  })

  it('calls onFilterChange when filter is pressed', () => {
    render(
      <PlantFilters
        selectedFilter="all"
        onFilterChange={mockOnFilterChange}
        counts={defaultCounts}
      />
    )

    fireEvent.press(screen.getByText('Healthy (7)'))

    expect(mockOnFilterChange).toHaveBeenCalledWith('healthy')
  })

  it('calls onFilterChange with attention when needs attention pressed', () => {
    render(
      <PlantFilters
        selectedFilter="all"
        onFilterChange={mockOnFilterChange}
        counts={defaultCounts}
      />
    )

    fireEvent.press(screen.getByText('Needs Attention (3)'))

    expect(mockOnFilterChange).toHaveBeenCalledWith('attention')
  })

  it('displays correct counts', () => {
    const customCounts = {
      all: 25,
      healthy: 20,
      attention: 5,
    }

    render(
      <PlantFilters
        selectedFilter="all"
        onFilterChange={mockOnFilterChange}
        counts={customCounts}
      />
    )

    expect(screen.getByText('All (25)')).toBeTruthy()
    expect(screen.getByText('Healthy (20)')).toBeTruthy()
    expect(screen.getByText('Needs Attention (5)')).toBeTruthy()
  })

  it('handles zero counts', () => {
    const zeroCounts = {
      all: 0,
      healthy: 0,
      attention: 0,
    }

    render(
      <PlantFilters
        selectedFilter="all"
        onFilterChange={mockOnFilterChange}
        counts={zeroCounts}
      />
    )

    expect(screen.getByText('All (0)')).toBeTruthy()
    expect(screen.getByText('Healthy (0)')).toBeTruthy()
    expect(screen.getByText('Needs Attention (0)')).toBeTruthy()
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
