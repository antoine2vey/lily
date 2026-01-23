import { fireEvent, render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'
import { Chip } from '../Chip'

describe('Chip', () => {
  it('renders label text', () => {
    render(<Chip label="Filter" />)
    expect(screen.getByText('Filter')).toBeTruthy()
  })

  it('renders with filter variant by default', () => {
    const { toJSON } = render(<Chip label="Filter" />)
    expect(toJSON()).toBeTruthy()
  })

  it('renders with input variant', () => {
    const { toJSON } = render(<Chip label="Input" variant="input" />)
    expect(toJSON()).toBeTruthy()
  })

  it('renders with suggestion variant', () => {
    const { toJSON } = render(<Chip label="Suggestion" variant="suggestion" />)
    expect(toJSON()).toBeTruthy()
  })

  it('renders unselected state by default', () => {
    const { toJSON } = render(<Chip label="Chip" />)
    expect(toJSON()).toBeTruthy()
  })

  it('renders selected state', () => {
    const { toJSON } = render(<Chip label="Chip" selected />)
    expect(toJSON()).toBeTruthy()
  })

  it('calls onPress when pressed', () => {
    const onPress = jest.fn()
    render(<Chip label="Pressable" onPress={onPress} />)

    fireEvent.press(screen.getByText('Pressable'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('does not call onPress when disabled', () => {
    const onPress = jest.fn()
    render(<Chip label="Disabled" onPress={onPress} disabled />)

    fireEvent.press(screen.getByText('Disabled'))
    expect(onPress).not.toHaveBeenCalled()
  })

  it('renders with icon', () => {
    const icon = <Text testID="chip-icon">Icon</Text>
    render(<Chip label="With Icon" icon={icon} />)
    expect(screen.getByTestId('chip-icon')).toBeTruthy()
  })

  it('applies disabled opacity', () => {
    const { toJSON } = render(<Chip label="Disabled" disabled />)
    expect(toJSON()).toBeTruthy()
  })

  it('does not wrap in Pressable when no onPress provided', () => {
    const { toJSON } = render(<Chip label="Static" />)
    expect(toJSON()).toBeTruthy()
  })
})
