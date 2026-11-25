import type { Notification } from '@lily/shared'
import { ZoneName } from '@lily/shared'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { router } from 'expo-router'
import { getDeviceTimezone } from '@/utils/notifications'
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

jest.mock('@/utils/notifications', () => ({
  ...jest.requireActual('@/utils/notifications'),
  getDeviceTimezone: jest.fn(() => 'UTC'),
}))

describe('NotificationsScreen', () => {
  beforeEach(() => {
    mockItems = []
  })

  afterEach(() => {
    jest.useRealTimers()
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

  it.each([
    {
      zone: 'Europe/Paris',
      now: '2026-01-16T08:00:00Z',
      createdAt: '2026-01-15T23:30:00Z',
      shown: 'Today',
      hidden: 'Yesterday',
    },
    {
      zone: 'Europe/Paris',
      now: '2026-01-15T23:45:00Z',
      createdAt: '2026-01-15T22:30:00Z',
      shown: 'Yesterday',
      hidden: 'Today',
    },
    {
      zone: 'America/Los_Angeles',
      now: '2026-01-16T01:00:00Z',
      createdAt: '2026-01-15T20:00:00Z',
      shown: 'Today',
      hidden: 'Yesterday',
    },
  ])(
    'in $zone at $now, a notification from $createdAt is under $shown',
    (row) => {
      jest.useFakeTimers({ now: new Date(row.now) })
      jest.mocked(getDeviceTimezone).mockReturnValue(ZoneName.make(row.zone))
      mockItems = [
        {
          id: 'notification-1',
          type: 'watering_reminder',
          title: 'Water the monstera',
          body: 'It is thirsty',
          scheduledAt: new Date(row.createdAt),
          isRead: true,
          status: 'sent',
          retryCount: 0,
          userId: 'user-1',
          metadata: {},
          createdAt: new Date(row.createdAt),
        },
      ]

      render(<NotificationsScreen />)

      expect(screen.getByText(row.shown)).toBeTruthy()
      expect(screen.queryByText(row.hidden)).toBeNull()
    }
  )
})
