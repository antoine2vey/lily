import type { Notification } from '@lily/shared'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { router } from 'expo-router'
import { NotificationsScreen } from '../NotificationsScreen'

let mockItems: Notification[] = []

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }))

jest.mock('@/hooks/useNotifications', () => ({
  useNotifications: jest.fn(() => ({
    data: { items: mockItems },
    isLoading: false,
    refetch: jest.fn(),
  })),
  useMarkNotificationRead: jest.fn(() => ({ mutate: jest.fn() })),
  useMarkAllRead: jest.fn(() => ({ mutate: jest.fn(), isPending: false })),
  useDeleteNotification: jest.fn(() => ({ mutate: jest.fn() })),
}))

describe('NotificationsScreen', () => {
  beforeEach(() => {
    mockItems = []
  })

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

  it('opens the delegation a care request points at', () => {
    mockItems = [
      {
        id: 'notification-1',
        type: 'delegation_request',
        title: 'Care request',
        body: 'Ada wants you to care for their plants',
        scheduledAt: new Date(),
        isRead: true,
        status: 'sent',
        retryCount: 0,
        userId: 'user-1',
        metadata: { delegationId: 'delegation-a' },
        createdAt: new Date(),
      },
    ]

    render(<NotificationsScreen />)
    fireEvent.press(screen.getByText('Care request'))

    expect(router.push).toHaveBeenCalledWith('/(app)/delegation/delegation-a')
  })
})
