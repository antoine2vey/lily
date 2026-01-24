import { mockNotifications } from '@lily/api/__tests__/fixtures/notifications'
import { fireEvent, render, screen } from '@testing-library/react-native'

// Mock dependencies
jest.mock('@/hooks/useNotifications', () => ({
  useNotifications: jest.fn(),
  useMarkAsRead: jest.fn(),
  useMarkAllAsRead: jest.fn(),
}))

import {
  useMarkAllAsRead,
  useMarkAsRead,
  useNotifications,
} from '@/hooks/useNotifications'
import { NotificationsScreen } from '../NotificationsScreen'

const mockedUseNotifications = useNotifications as jest.MockedFunction<
  typeof useNotifications
>
const mockedUseMarkAsRead = useMarkAsRead as jest.MockedFunction<
  typeof useMarkAsRead
>
const mockedUseMarkAllAsRead = useMarkAllAsRead as jest.MockedFunction<
  typeof useMarkAllAsRead
>

describe('NotificationsScreen', () => {
  const mockMarkAsRead = jest.fn()
  const mockMarkAllAsRead = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    mockedUseMarkAsRead.mockReturnValue({ mutate: mockMarkAsRead })
    mockedUseMarkAllAsRead.mockReturnValue({ mutate: mockMarkAllAsRead })
  })

  it('shows loading state initially', () => {
    mockedUseNotifications.mockReturnValue({
      data: undefined,
      isLoading: true,
    })

    const { toJSON } = render(<NotificationsScreen />)

    // When loading, component should render something
    expect(toJSON()).toBeTruthy()
  })

  it('displays notifications title', () => {
    mockedUseNotifications.mockReturnValue({
      data: { items: mockNotifications },
      isLoading: false,
    })

    render(<NotificationsScreen />)

    expect(screen.getByText('Notifications')).toBeTruthy()
  })

  it('displays tab filters', () => {
    mockedUseNotifications.mockReturnValue({
      data: { items: mockNotifications },
      isLoading: false,
    })

    render(<NotificationsScreen />)

    expect(screen.getByText('All')).toBeTruthy()
    expect(screen.getByText('Unread')).toBeTruthy()
  })

  it('shows empty state when no notifications', () => {
    mockedUseNotifications.mockReturnValue({
      data: { items: [] },
      isLoading: false,
    })

    render(<NotificationsScreen />)

    expect(screen.getByText('No notifications')).toBeTruthy()
    expect(screen.getByText('Notifications will appear here')).toBeTruthy()
  })

  it('shows empty state for unread tab when all read', () => {
    const allReadNotifications = mockNotifications.map((n) => ({
      ...n,
      isRead: true,
    }))

    mockedUseNotifications.mockReturnValue({
      data: { items: allReadNotifications },
      isLoading: false,
    })

    render(<NotificationsScreen />)

    fireEvent.press(screen.getByText('Unread'))

    expect(screen.getByText('No unread notifications')).toBeTruthy()
    expect(screen.getByText("You're all caught up!")).toBeTruthy()
  })

  it('displays notification items', () => {
    const testNotifications = [
      {
        id: '1',
        type: 'care_reminder',
        title: 'Water your Monstera',
        body: 'It has been 7 days since you watered this plant',
        isRead: false,
        createdAt: new Date(),
      },
    ]

    mockedUseNotifications.mockReturnValue({
      data: { items: testNotifications },
      isLoading: false,
    })

    render(<NotificationsScreen />)

    expect(screen.getByText('Water your Monstera')).toBeTruthy()
  })

  it('shows mark all read button when unread notifications exist', () => {
    const unreadNotifications = [
      {
        id: '1',
        type: 'care_reminder',
        title: 'Test Notification',
        body: 'Test body',
        isRead: false,
        createdAt: new Date(),
      },
    ]

    mockedUseNotifications.mockReturnValue({
      data: { items: unreadNotifications },
      isLoading: false,
    })

    render(<NotificationsScreen />)

    expect(screen.getByText('Mark all read')).toBeTruthy()
  })

  it('calls markAllAsRead when mark all read is pressed', () => {
    const unreadNotifications = [
      {
        id: '1',
        type: 'care_reminder',
        title: 'Test Notification',
        body: 'Test body',
        isRead: false,
        createdAt: new Date(),
      },
    ]

    mockedUseNotifications.mockReturnValue({
      data: { items: unreadNotifications },
      isLoading: false,
    })

    render(<NotificationsScreen />)

    fireEvent.press(screen.getByText('Mark all read'))

    expect(mockMarkAllAsRead).toHaveBeenCalled()
  })

  it('displays unread count badge', () => {
    const mixedNotifications = [
      {
        id: '1',
        type: 'care_reminder',
        title: 'Unread 1',
        body: 'Test',
        isRead: false,
        createdAt: new Date(),
      },
      {
        id: '2',
        type: 'achievement',
        title: 'Unread 2',
        body: 'Test',
        isRead: false,
        createdAt: new Date(),
      },
      {
        id: '3',
        type: 'tip',
        title: 'Read',
        body: 'Test',
        isRead: true,
        createdAt: new Date(),
      },
    ]

    mockedUseNotifications.mockReturnValue({
      data: { items: mixedNotifications },
      isLoading: false,
    })

    render(<NotificationsScreen />)

    expect(screen.getByText('2')).toBeTruthy() // Unread count badge
  })

  it('filters to show only unread when unread tab is selected', () => {
    const mixedNotifications = [
      {
        id: '1',
        type: 'care_reminder',
        title: 'Unread Notification',
        body: 'Test',
        isRead: false,
        createdAt: new Date(),
      },
      {
        id: '2',
        type: 'achievement',
        title: 'Read Notification',
        body: 'Test',
        isRead: true,
        createdAt: new Date(),
      },
    ]

    mockedUseNotifications.mockReturnValue({
      data: { items: mixedNotifications },
      isLoading: false,
    })

    render(<NotificationsScreen />)

    fireEvent.press(screen.getByText('Unread'))

    expect(screen.getByText('Unread Notification')).toBeTruthy()
    expect(screen.queryByText('Read Notification')).toBeNull()
  })
})
