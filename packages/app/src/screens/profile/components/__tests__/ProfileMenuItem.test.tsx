import { fireEvent, render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'
import { ProfileMenuItem } from '../ProfileMenuItem'

describe('ProfileMenuItem', () => {
  const mockOnPress = jest.fn()
  const mockIcon = <Text>icon</Text>

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders menu item with title', () => {
    render(
      <ProfileMenuItem icon={mockIcon} title="Settings" onPress={mockOnPress} />
    )

    expect(screen.getByText('Settings')).toBeTruthy()
  })

  it('renders icon', () => {
    render(
      <ProfileMenuItem icon={mockIcon} title="Settings" onPress={mockOnPress} />
    )

    expect(screen.getByText('icon')).toBeTruthy()
  })

  it('calls onPress when pressed', () => {
    render(
      <ProfileMenuItem icon={mockIcon} title="Settings" onPress={mockOnPress} />
    )

    fireEvent.press(screen.getByText('Settings'))

    expect(mockOnPress).toHaveBeenCalledTimes(1)
  })

  it('renders badge when provided', () => {
    render(
      <ProfileMenuItem
        icon={mockIcon}
        title="Settings"
        badge={<Text>Pro</Text>}
        onPress={mockOnPress}
      />
    )

    expect(screen.getByText('Pro')).toBeTruthy()
  })
})
