import { fireEvent, render, screen } from '@testing-library/react-native'
import { Option } from 'effect'
import { AvatarPicker } from '../AvatarPicker'

describe('AvatarPicker', () => {
  const mockOnPress = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('displays first letter when no avatar URL', () => {
    render(
      <AvatarPicker
        avatarUrl={Option.none()}
        name="John Doe"
        onPress={mockOnPress}
      />
    )

    expect(screen.getByText('J')).toBeTruthy()
  })

  it('displays change photo text', () => {
    render(
      <AvatarPicker
        avatarUrl={Option.none()}
        name="John Doe"
        onPress={mockOnPress}
      />
    )

    expect(screen.getByText('Change Photo')).toBeTruthy()
  })

  it('calls onPress when avatar is pressed', () => {
    render(
      <AvatarPicker
        avatarUrl={Option.none()}
        name="John Doe"
        onPress={mockOnPress}
      />
    )

    fireEvent.press(screen.getByText('Change Photo'))

    expect(mockOnPress).toHaveBeenCalledTimes(1)
  })

  it('displays image when avatar URL provided', () => {
    render(
      <AvatarPicker
        avatarUrl={Option.some('https://example.com/avatar.jpg')}
        name="John Doe"
        onPress={mockOnPress}
      />
    )

    // When URL is provided, initial letter should not be visible
    expect(screen.queryByText('J')).toBeNull()
  })

  it('handles lowercase names', () => {
    render(
      <AvatarPicker
        avatarUrl={Option.none()}
        name="jane"
        onPress={mockOnPress}
      />
    )

    expect(screen.getByText('J')).toBeTruthy()
  })
})
