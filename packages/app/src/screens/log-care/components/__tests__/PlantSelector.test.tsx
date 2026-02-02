import { fireEvent, render, screen } from '@testing-library/react-native'
import { mockPlants } from 'src/__tests__/fixtures/plants'

// Mock dependencies
jest.mock('src/hooks/usePlants', () => ({
  usePlants: jest.fn(),
}))

import { usePlants } from 'src/hooks/usePlants'
import { PlantSelector } from '../PlantSelector'

const mockedUsePlants = usePlants as jest.Mock

describe('PlantSelector', () => {
  const mockOnSelectionChange = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    mockedUsePlants.mockReturnValue({
      data: { items: mockPlants, total: mockPlants.length },
      isLoading: false,
    })
  })

  it('renders select plant label', () => {
    render(
      <PlantSelector
        selectedIds={[]}
        onSelectionChange={mockOnSelectionChange}
      />
    )

    expect(screen.getByText('Which plant?')).toBeTruthy()
  })

  it('renders custom label', () => {
    render(
      <PlantSelector
        selectedIds={[]}
        onSelectionChange={mockOnSelectionChange}
        label="Choose Plants"
      />
    )

    expect(screen.getByText('Choose Plants')).toBeTruthy()
  })

  it('shows select a plant placeholder when none selected', () => {
    render(
      <PlantSelector
        selectedIds={[]}
        onSelectionChange={mockOnSelectionChange}
      />
    )

    expect(screen.getByText('Select a plant')).toBeTruthy()
  })

  it('shows plant name when one selected', () => {
    render(
      <PlantSelector
        selectedIds={[mockPlants[0].id]}
        onSelectionChange={mockOnSelectionChange}
      />
    )

    expect(screen.getByText(mockPlants[0].name)).toBeTruthy()
  })

  it('shows count when multiple selected', () => {
    render(
      <PlantSelector
        selectedIds={[mockPlants[0].id, mockPlants[1].id]}
        onSelectionChange={mockOnSelectionChange}
      />
    )

    expect(screen.getByText('2 plants selected')).toBeTruthy()
  })

  it('opens bottom sheet when pressed', () => {
    render(
      <PlantSelector
        selectedIds={[]}
        onSelectionChange={mockOnSelectionChange}
      />
    )

    fireEvent.press(screen.getByText('Select a plant'))

    // Bottom sheet should open with title "Select Plants"
    expect(screen.getByText('Select Plants')).toBeTruthy()
  })
})
