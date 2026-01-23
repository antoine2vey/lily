import { fireEvent, render, screen } from '@testing-library/react-native'
import { NotificationItem } from '../NotificationItem'

describe('NotificationItem', () => {
  const mockOnPress = jest.fn()

  const baseNotification = {
    id: 'notif-1',
    title: 'Water your plants',
    body: 'Your Monstera needs watering today',
    read: false,
    createdAt: '2024-01-15T10:30:00Z',
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders notification title', () => {
    render(
      <NotificationItem
        notification={{ ...baseNotification, type: 'care_reminder' }}
        onPress={mockOnPress}
      />
    )

    expect(screen.getByText('Water your plants')).toBeTruthy()
  })

  it('renders notification body', () => {
    render(
      <NotificationItem
        notification={{ ...baseNotification, type: 'care_reminder' }}
        onPress={mockOnPress}
      />
    )

    expect(screen.getByText('Your Monstera needs watering today')).toBeTruthy()
  })

  it('calls onPress when pressed', () => {
    render(
      <NotificationItem
        notification={{ ...baseNotification, type: 'care_reminder' }}
        onPress={mockOnPress}
      />
    )

    fireEvent.press(screen.getByText('Water your plants'))

    expect(mockOnPress).toHaveBeenCalledTimes(1)
  })

  it('renders care_reminder notification type', () => {
    render(
      <NotificationItem
        notification={{ ...baseNotification, type: 'care_reminder' }}
        onPress={mockOnPress}
      />
    )

    expect(screen.getByText('Water your plants')).toBeTruthy()
  })

  it('renders achievement notification type', () => {
    render(
      <NotificationItem
        notification={{
          ...baseNotification,
          type: 'achievement',
          title: 'Achievement Unlocked!',
        }}
        onPress={mockOnPress}
      />
    )

    expect(screen.getByText('Achievement Unlocked!')).toBeTruthy()
  })

  it('renders tip notification type', () => {
    render(
      <NotificationItem
        notification={{
          ...baseNotification,
          type: 'tip',
          title: 'Pro tip',
        }}
        onPress={mockOnPress}
      />
    )

    expect(screen.getByText('Pro tip')).toBeTruthy()
  })

  it('renders system notification type', () => {
    render(
      <NotificationItem
        notification={{
          ...baseNotification,
          type: 'system',
          title: 'App Update',
        }}
        onPress={mockOnPress}
      />
    )

    expect(screen.getByText('App Update')).toBeTruthy()
  })
})
