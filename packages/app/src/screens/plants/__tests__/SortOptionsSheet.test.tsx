import { fireEvent, render, screen } from '@testing-library/react-native'
import { SortOptionsSheet } from '../components/SortOptionsSheet'

describe('SortOptionsSheet', () => {
  const mockOnClose = jest.fn()
  const mockOnSelect = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders when visible', () => {
    render(
      <SortOptionsSheet
        visible={true}
        onClose={mockOnClose}
        selectedOption="name"
        onSelect={mockOnSelect}
      />
    )

    expect(screen.getByText('Sort by')).toBeTruthy()
  })

  it('displays all sort options', () => {
    render(
      <SortOptionsSheet
        visible={true}
        onClose={mockOnClose}
        selectedOption="name"
        onSelect={mockOnSelect}
      />
    )

    expect(screen.getByText('Name (A-Z)')).toBeTruthy()
    expect(screen.getByText('Recently Added')).toBeTruthy()
    expect(screen.getByText('Needs Water Soon')).toBeTruthy()
    expect(screen.getByText('Needs Attention')).toBeTruthy()
  })

  it('calls onSelect and onClose when option is pressed', () => {
    render(
      <SortOptionsSheet
        visible={true}
        onClose={mockOnClose}
        selectedOption="name"
        onSelect={mockOnSelect}
      />
    )

    fireEvent.press(screen.getByText('Recently Added'))

    expect(mockOnSelect).toHaveBeenCalledWith('dateAdded')
    expect(mockOnClose).toHaveBeenCalled()
  })

  it('calls onSelect with nextWater option', () => {
    render(
      <SortOptionsSheet
        visible={true}
        onClose={mockOnClose}
        selectedOption="name"
        onSelect={mockOnSelect}
      />
    )

    fireEvent.press(screen.getByText('Needs Water Soon'))

    expect(mockOnSelect).toHaveBeenCalledWith('nextWater')
  })

  it('calls onSelect with health option', () => {
    render(
      <SortOptionsSheet
        visible={true}
        onClose={mockOnClose}
        selectedOption="name"
        onSelect={mockOnSelect}
      />
    )

    fireEvent.press(screen.getByText('Needs Attention'))

    expect(mockOnSelect).toHaveBeenCalledWith('health')
  })

  it('has testID for sheet content', () => {
    render(
      <SortOptionsSheet
        visible={true}
        onClose={mockOnClose}
        selectedOption="name"
        onSelect={mockOnSelect}
      />
    )

    expect(screen.getByTestId('sort-options-sheet')).toBeTruthy()
  })
})
