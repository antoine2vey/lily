import { fireEvent, render } from '@testing-library/react-native'
import { NotificationBell } from '../NotificationBell'

describe('NotificationBell', () => {
  const defaultProps = {
    onPress: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders bell icon', () => {
    const { toJSON } = render(<NotificationBell {...defaultProps} />)
    expect(toJSON()).toBeTruthy()
  })

  it('shows badge when unreadCount > 0', () => {
    const { getByText } = render(
      <NotificationBell {...defaultProps} unreadCount={5} />
    )
    expect(getByText('5')).toBeTruthy()
  })

  it('hides badge when unreadCount = 0', () => {
    const { queryByText } = render(
      <NotificationBell {...defaultProps} unreadCount={0} />
    )
    expect(queryByText('0')).toBeNull()
  })

  it('shows "9+" when count > 9', () => {
    const { getByText } = render(
      <NotificationBell {...defaultProps} unreadCount={15} />
    )
    expect(getByText('9+')).toBeTruthy()
  })

  it('calls onPress when pressed', () => {
    const onPress = jest.fn()
    const { getByRole } = render(<NotificationBell onPress={onPress} />)
    fireEvent.press(getByRole('button'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })
})
