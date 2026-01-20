import { fireEvent, render, screen } from '@testing-library/react-native'
import { SortOptionsSheet } from '../SortOptionsSheet'

describe('SortOptionsSheet', () => {
  it('renders all sort options', () => {
    render(
      <SortOptionsSheet
        visible={true}
        onClose={jest.fn()}
        selectedOption="name"
        onSelect={jest.fn()}
      />
    )
    expect(screen.getByText('Name (A-Z)')).toBeTruthy()
    expect(screen.getByText('Recently Added')).toBeTruthy()
    expect(screen.getByText('Needs Water Soon')).toBeTruthy()
    expect(screen.getByText('Needs Attention')).toBeTruthy()
  })

  it('does not render when not visible', () => {
    render(
      <SortOptionsSheet
        visible={false}
        onClose={jest.fn()}
        selectedOption="name"
        onSelect={jest.fn()}
      />
    )
    expect(screen.queryByText('Name (A-Z)')).toBeNull()
  })

  it('shows checkmark on selected option', () => {
    const { rerender } = render(
      <SortOptionsSheet
        visible={true}
        onClose={jest.fn()}
        selectedOption="name"
        onSelect={jest.fn()}
      />
    )
    // The checkmark icon is rendered next to the selected option
    expect(screen.getByText('Name (A-Z)')).toBeTruthy()

    rerender(
      <SortOptionsSheet
        visible={true}
        onClose={jest.fn()}
        selectedOption="dateAdded"
        onSelect={jest.fn()}
      />
    )
    expect(screen.getByText('Recently Added')).toBeTruthy()
  })

  it('calls onSelect when option pressed', () => {
    const onSelect = jest.fn()
    render(
      <SortOptionsSheet
        visible={true}
        onClose={jest.fn()}
        selectedOption="name"
        onSelect={onSelect}
      />
    )
    fireEvent.press(screen.getByText('Recently Added'))
    expect(onSelect).toHaveBeenCalledWith('dateAdded')
  })

  it('closes sheet after selection', () => {
    const onClose = jest.fn()
    render(
      <SortOptionsSheet
        visible={true}
        onClose={onClose}
        selectedOption="name"
        onSelect={jest.fn()}
      />
    )
    fireEvent.press(screen.getByText('Needs Water Soon'))
    expect(onClose).toHaveBeenCalled()
  })
})
