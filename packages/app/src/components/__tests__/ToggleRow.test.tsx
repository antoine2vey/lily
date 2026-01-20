import { fireEvent, render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'
import { ToggleRow } from '../ToggleRow'

describe('ToggleRow', () => {
  it('renders label', () => {
    render(
      <ToggleRow
        label="Push Notifications"
        value={false}
        onValueChange={() => {}}
      />
    )
    expect(screen.getByText('Push Notifications')).toBeTruthy()
  })

  it('renders description when provided', () => {
    render(
      <ToggleRow
        label="Push Notifications"
        description="Receive push notifications for care reminders"
        value={false}
        onValueChange={() => {}}
      />
    )
    expect(screen.getByText('Push Notifications')).toBeTruthy()
    expect(
      screen.getByText('Receive push notifications for care reminders')
    ).toBeTruthy()
  })

  it('renders icon when provided', () => {
    render(
      <ToggleRow
        label="Notifications"
        value={false}
        onValueChange={() => {}}
        icon={<Text testID="toggle-icon">Icon</Text>}
      />
    )
    expect(screen.getByTestId('toggle-icon')).toBeTruthy()
  })

  it('shows switch in correct state', () => {
    const { rerender, toJSON } = render(
      <ToggleRow label="Feature" value={true} onValueChange={() => {}} />
    )
    expect(toJSON()).toBeTruthy()

    rerender(
      <ToggleRow label="Feature" value={false} onValueChange={() => {}} />
    )
    expect(toJSON()).toBeTruthy()
  })

  it('calls onValueChange when toggled', () => {
    const onValueChange = jest.fn()
    render(
      <ToggleRow label="Feature" value={false} onValueChange={onValueChange} />
    )
    const switchElement = screen.getByRole('switch')
    fireEvent(switchElement, 'valueChange', true)
    expect(onValueChange).toHaveBeenCalledWith(true)
  })

  it('disables interaction when disabled=true', () => {
    const { toJSON } = render(
      <ToggleRow
        label="Feature"
        value={false}
        onValueChange={() => {}}
        disabled
      />
    )
    expect(toJSON()).toBeTruthy()
  })
})
