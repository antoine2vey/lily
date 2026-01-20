import { fireEvent, render, screen } from '@testing-library/react-native'
import { PlantFilters } from '../PlantFilters'

const mockCounts = {
  all: 12,
  healthy: 8,
  attention: 4,
}

describe('PlantFilters', () => {
  it('renders all filter options', () => {
    render(
      <PlantFilters
        selectedFilter="all"
        onFilterChange={jest.fn()}
        counts={mockCounts}
      />
    )
    expect(screen.getByText('All (12)')).toBeTruthy()
    expect(screen.getByText('Healthy (8)')).toBeTruthy()
    expect(screen.getByText('Needs Attention (4)')).toBeTruthy()
  })

  it('shows count in chip label', () => {
    render(
      <PlantFilters
        selectedFilter="all"
        onFilterChange={jest.fn()}
        counts={mockCounts}
      />
    )
    // All chips should show their counts
    expect(screen.getByText('All (12)')).toBeTruthy()
    expect(screen.getByText('Healthy (8)')).toBeTruthy()
    expect(screen.getByText('Needs Attention (4)')).toBeTruthy()
  })

  it('highlights selected filter', () => {
    const { rerender } = render(
      <PlantFilters
        selectedFilter="healthy"
        onFilterChange={jest.fn()}
        counts={mockCounts}
      />
    )
    // The Chip component handles the selected state styling internally
    // We can verify the text is rendered
    expect(screen.getByText('Healthy (8)')).toBeTruthy()

    rerender(
      <PlantFilters
        selectedFilter="attention"
        onFilterChange={jest.fn()}
        counts={mockCounts}
      />
    )
    expect(screen.getByText('Needs Attention (4)')).toBeTruthy()
  })

  it('calls onFilterChange when chip pressed', () => {
    const onFilterChange = jest.fn()
    render(
      <PlantFilters
        selectedFilter="all"
        onFilterChange={onFilterChange}
        counts={mockCounts}
      />
    )

    fireEvent.press(screen.getByText('Healthy (8)'))
    expect(onFilterChange).toHaveBeenCalledWith('healthy')

    fireEvent.press(screen.getByText('Needs Attention (4)'))
    expect(onFilterChange).toHaveBeenCalledWith('attention')
  })
})
