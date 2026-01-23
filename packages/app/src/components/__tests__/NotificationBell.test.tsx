import { fireEvent, render, screen } from '@testing-library/react-native'
import { NotificationBell } from '../NotificationBell'

describe('NotificationBell', () => {
  it('renders bell icon', () => {
    const { toJSON } = render(<NotificationBell onPress={jest.fn()} />)
    expect(toJSON()).toBeTruthy()
  })

  it('calls onPress when pressed', () => {
    const onPress = jest.fn()
    const { getByRole } = render(<NotificationBell onPress={onPress} />)

    fireEvent.press(getByRole('button'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('does not show badge when unreadCount is 0', () => {
    render(<NotificationBell onPress={jest.fn()} unreadCount={0} />)
    expect(screen.queryByText('0')).toBeNull()
  })

  it('shows badge with count when unreadCount > 0', () => {
    render(<NotificationBell onPress={jest.fn()} unreadCount={5} />)
    expect(screen.getByText('5')).toBeTruthy()
  })

  it('shows 9+ when unreadCount > 9', () => {
    render(<NotificationBell onPress={jest.fn()} unreadCount={15} />)
    expect(screen.getByText('9+')).toBeTruthy()
  })

  it('shows 9+ when unreadCount is exactly 10', () => {
    render(<NotificationBell onPress={jest.fn()} unreadCount={10} />)
    expect(screen.getByText('9+')).toBeTruthy()
  })

  it('shows 9 when unreadCount is exactly 9', () => {
    render(<NotificationBell onPress={jest.fn()} unreadCount={9} />)
    expect(screen.getByText('9')).toBeTruthy()
  })

  it('has correct accessibility label without unread', () => {
    const { getByLabelText } = render(
      <NotificationBell onPress={jest.fn()} unreadCount={0} />
    )
    expect(getByLabelText('Notifications')).toBeTruthy()
  })

  it('has correct accessibility label with unread count', () => {
    const { getByLabelText } = render(
      <NotificationBell onPress={jest.fn()} unreadCount={3} />
    )
    expect(getByLabelText('Notifications, 3 unread')).toBeTruthy()
  })

  it('defaults to 0 unread when no count provided', () => {
    render(<NotificationBell onPress={jest.fn()} />)
    expect(screen.queryByText('0')).toBeNull()
    expect(screen.queryByText('1')).toBeNull()
  })
})
