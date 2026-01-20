import { fireEvent, render, screen } from '@testing-library/react-native'
import { PlantSearchBar } from '../PlantSearchBar'

describe('PlantSearchBar', () => {
  it('renders search bar container', () => {
    render(
      <PlantSearchBar value="" onChangeText={jest.fn()} onClear={jest.fn()} />
    )
    expect(screen.getByTestId('plant-search-bar')).toBeTruthy()
  })

  it('renders placeholder text', () => {
    render(
      <PlantSearchBar value="" onChangeText={jest.fn()} onClear={jest.fn()} />
    )
    expect(screen.getByPlaceholderText('Search plants...')).toBeTruthy()
  })

  it('renders custom placeholder text', () => {
    render(
      <PlantSearchBar
        value=""
        onChangeText={jest.fn()}
        onClear={jest.fn()}
        placeholder="Find your plant..."
      />
    )
    expect(screen.getByPlaceholderText('Find your plant...')).toBeTruthy()
  })

  it('calls onChangeText when typing', () => {
    const onChangeText = jest.fn()
    render(
      <PlantSearchBar
        value=""
        onChangeText={onChangeText}
        onClear={jest.fn()}
      />
    )
    fireEvent.changeText(screen.getByTestId('search-input'), 'Monstera')
    expect(onChangeText).toHaveBeenCalledWith('Monstera')
  })

  it('shows clear button when text entered', () => {
    render(
      <PlantSearchBar
        value="Monstera"
        onChangeText={jest.fn()}
        onClear={jest.fn()}
      />
    )
    expect(screen.getByTestId('clear-button')).toBeTruthy()
  })

  it('calls onClear when clear pressed', () => {
    const onClear = jest.fn()
    render(
      <PlantSearchBar
        value="Monstera"
        onChangeText={jest.fn()}
        onClear={onClear}
      />
    )
    fireEvent.press(screen.getByTestId('clear-button'))
    expect(onClear).toHaveBeenCalled()
  })

  it('hides clear button when empty', () => {
    render(
      <PlantSearchBar value="" onChangeText={jest.fn()} onClear={jest.fn()} />
    )
    expect(screen.queryByTestId('clear-button')).toBeNull()
  })
})
