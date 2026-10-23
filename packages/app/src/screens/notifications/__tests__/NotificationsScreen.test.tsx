import { render, screen } from '@testing-library/react-native'
import { NotificationsScreen } from '../NotificationsScreen'

jest.mock('@/hooks/useNotifications', () => ({
  useNotifications: jest.fn(() => ({
    data: { items: [] },
    isLoading: false,
    refetch: jest.fn(),
  })),
  useMarkNotificationRead: jest.fn(() => ({ mutate: jest.fn() })),
  useMarkAllRead: jest.fn(() => ({ mutate: jest.fn(), isPending: false })),
  useDeleteNotification: jest.fn(() => ({ mutate: jest.fn() })),
}))

describe('NotificationsScreen', () => {
  it('titles the inbox Notifications, not the settings screen title', () => {
    render(<NotificationsScreen />)

    expect(screen.getByText('Notifications')).toBeTruthy()
    expect(screen.queryByText('Notification Settings')).toBeNull()
  })

  it('shows the mascot empty state when there are no notifications', () => {
    render(<NotificationsScreen />)

    expect(screen.getByTestId('mascot-bell')).toBeTruthy()
    expect(screen.getByText("You're all caught up!")).toBeTruthy()
    expect(
      screen.getByText("I'll ring as soon as a plant needs you.")
    ).toBeTruthy()
  })
})
