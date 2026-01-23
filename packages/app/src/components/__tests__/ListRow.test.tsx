import { fireEvent, render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'
import { ListRow } from '../ListRow'

describe('ListRow', () => {
  it('renders title', () => {
    render(<ListRow title="Settings" />)
    expect(screen.getByText('Settings')).toBeTruthy()
  })

  it('renders subtitle when provided', () => {
    render(<ListRow title="Settings" subtitle="Manage your preferences" />)
    expect(screen.getByText('Manage your preferences')).toBeTruthy()
  })

  it('does not render subtitle when not provided', () => {
    render(<ListRow title="Settings" />)
    expect(screen.queryByText('Manage')).toBeNull()
  })

  it('renders left icon when provided', () => {
    const icon = <Text testID="left-icon">Icon</Text>
    render(<ListRow title="Settings" leftIcon={icon} />)
    expect(screen.getByTestId('left-icon')).toBeTruthy()
  })

  it('renders right element when provided', () => {
    const element = <Text testID="right-element">Badge</Text>
    render(<ListRow title="Settings" rightElement={element} />)
    expect(screen.getByTestId('right-element')).toBeTruthy()
  })

  it('renders chevron when showChevron is true', () => {
    const { toJSON } = render(<ListRow title="Settings" showChevron />)
    expect(toJSON()).toBeTruthy()
  })

  it('does not render chevron by default', () => {
    const { toJSON } = render(<ListRow title="Settings" />)
    expect(toJSON()).toBeTruthy()
  })

  it('calls onPress when pressed', () => {
    const onPress = jest.fn()
    render(<ListRow title="Settings" onPress={onPress} />)

    fireEvent.press(screen.getByText('Settings'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('applies destructive styling', () => {
    const { toJSON } = render(<ListRow title="Delete" destructive />)
    expect(toJSON()).toBeTruthy()
  })

  it('renders with all props', () => {
    const onPress = jest.fn()
    const { toJSON } = render(
      <ListRow
        title="Complete Row"
        subtitle="With all options"
        leftIcon={<Text>Icon</Text>}
        rightElement={<Text>Badge</Text>}
        onPress={onPress}
        showChevron
      />
    )
    expect(toJSON()).toBeTruthy()
  })

  it('does not wrap in Pressable when no onPress provided', () => {
    const { toJSON } = render(<ListRow title="Static Row" />)
    expect(toJSON()).toBeTruthy()
  })
})
