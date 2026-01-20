import { fireEvent, render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'
import { Chip } from '../Chip'

describe('Chip', () => {
  it('renders label', () => {
    render(<Chip label="All" />)
    expect(screen.getByText('All')).toBeTruthy()
  })

  it('renders unselected state with border', () => {
    const { toJSON } = render(<Chip label="Healthy" selected={false} />)
    expect(toJSON()).toBeTruthy()
  })

  it('renders selected state with fill', () => {
    const { toJSON } = render(<Chip label="All" selected />)
    expect(toJSON()).toBeTruthy()
  })

  it('renders icon when provided', () => {
    render(
      <Chip label="Watering" icon={<Text testID="chip-icon">Icon</Text>} />
    )
    expect(screen.getByTestId('chip-icon')).toBeTruthy()
  })

  it('calls onPress when pressed', () => {
    const onPress = jest.fn()
    render(<Chip label="Filter" onPress={onPress} />)
    fireEvent.press(screen.getByText('Filter'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('does not call onPress when disabled', () => {
    const onPress = jest.fn()
    render(<Chip label="Filter" onPress={onPress} disabled />)
    fireEvent.press(screen.getByText('Filter'))
    expect(onPress).not.toHaveBeenCalled()
  })

  it('renders different variants', () => {
    const { rerender, toJSON } = render(
      <Chip label="Filter" variant="filter" />
    )
    expect(toJSON()).toBeTruthy()

    rerender(<Chip label="Input" variant="input" />)
    expect(toJSON()).toBeTruthy()

    rerender(<Chip label="Suggestion" variant="suggestion" />)
    expect(toJSON()).toBeTruthy()
  })
})
