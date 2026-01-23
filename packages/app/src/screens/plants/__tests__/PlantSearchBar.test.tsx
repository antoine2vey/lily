import { fireEvent, render, screen } from '@testing-library/react-native'
import { PlantSearchBar } from '../components/PlantSearchBar'

describe('PlantSearchBar', () => {
  const mockOnChangeText = jest.fn()
  const mockOnClear = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders with default placeholder', () => {
    render(
      <PlantSearchBar
        value=""
        onChangeText={mockOnChangeText}
        onClear={mockOnClear}
      />
    )

    expect(screen.getByPlaceholderText('Search plants...')).toBeTruthy()
  })

  it('renders with custom placeholder', () => {
    render(
      <PlantSearchBar
        value=""
        onChangeText={mockOnChangeText}
        onClear={mockOnClear}
        placeholder="Find a plant..."
      />
    )

    expect(screen.getByPlaceholderText('Find a plant...')).toBeTruthy()
  })

  it('displays search icon', () => {
    render(
      <PlantSearchBar
        value=""
        onChangeText={mockOnChangeText}
        onClear={mockOnClear}
      />
    )

    expect(screen.getByTestId('search-icon')).toBeTruthy()
  })

  it('calls onChangeText when text is entered', () => {
    render(
      <PlantSearchBar
        value=""
        onChangeText={mockOnChangeText}
        onClear={mockOnClear}
      />
    )

    fireEvent.changeText(screen.getByTestId('search-input'), 'monstera')

    expect(mockOnChangeText).toHaveBeenCalledWith('monstera')
  })

  it('does not show clear button when value is empty', () => {
    render(
      <PlantSearchBar
        value=""
        onChangeText={mockOnChangeText}
        onClear={mockOnClear}
      />
    )

    expect(screen.queryByTestId('clear-button')).toBeNull()
  })

  it('shows clear button when value is not empty', () => {
    render(
      <PlantSearchBar
        value="monstera"
        onChangeText={mockOnChangeText}
        onClear={mockOnClear}
      />
    )

    expect(screen.getByTestId('clear-button')).toBeTruthy()
  })

  it('calls onClear when clear button is pressed', () => {
    render(
      <PlantSearchBar
        value="monstera"
        onChangeText={mockOnChangeText}
        onClear={mockOnClear}
      />
    )

    fireEvent.press(screen.getByTestId('clear-button'))

    expect(mockOnClear).toHaveBeenCalled()
  })

  it('has testID for container', () => {
    render(
      <PlantSearchBar
        value=""
        onChangeText={mockOnChangeText}
        onClear={mockOnClear}
      />
    )

    expect(screen.getByTestId('plant-search-bar')).toBeTruthy()
  })

  it('displays current value', () => {
    render(
      <PlantSearchBar
        value="fern"
        onChangeText={mockOnChangeText}
        onClear={mockOnClear}
      />
    )

    expect(screen.getByDisplayValue('fern')).toBeTruthy()
  })
})
