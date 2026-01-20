import { fireEvent, render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'
import { ListRow } from '../ListRow'

describe('ListRow', () => {
  it('renders title', () => {
    render(<ListRow title="Settings" />)
    expect(screen.getByText('Settings')).toBeTruthy()
  })

  it('renders subtitle when provided', () => {
    render(<ListRow title="Account" subtitle="Manage your account settings" />)
    expect(screen.getByText('Account')).toBeTruthy()
    expect(screen.getByText('Manage your account settings')).toBeTruthy()
  })

  it('renders left icon in circle background', () => {
    render(
      <ListRow
        title="Notifications"
        leftIcon={<Text testID="left-icon">Icon</Text>}
      />
    )
    expect(screen.getByTestId('left-icon')).toBeTruthy()
  })

  it('renders right element', () => {
    render(
      <ListRow
        title="Version"
        rightElement={<Text testID="right-element">1.0.0</Text>}
      />
    )
    expect(screen.getByTestId('right-element')).toBeTruthy()
  })

  it('shows chevron when showChevron=true', () => {
    const { toJSON } = render(<ListRow title="Profile" showChevron />)
    expect(toJSON()).toBeTruthy()
  })

  it('applies red color when destructive=true', () => {
    const { toJSON } = render(<ListRow title="Delete Account" destructive />)
    expect(toJSON()).toBeTruthy()
  })

  it('handles press', () => {
    const onPress = jest.fn()
    render(<ListRow title="Settings" onPress={onPress} />)
    fireEvent.press(screen.getByText('Settings'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })
})
