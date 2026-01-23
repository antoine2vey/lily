import { fireEvent, render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'
import { ToggleRow } from '../ToggleRow'

describe('ToggleRow', () => {
  it('renders label', () => {
    render(
      <ToggleRow
        label="Notifications"
        value={false}
        onValueChange={jest.fn()}
      />
    )
    expect(screen.getByText('Notifications')).toBeTruthy()
  })

  it('renders description when provided', () => {
    render(
      <ToggleRow
        label="Notifications"
        description="Receive push notifications"
        value={false}
        onValueChange={jest.fn()}
      />
    )
    expect(screen.getByText('Receive push notifications')).toBeTruthy()
  })

  it('does not render description when not provided', () => {
    render(
      <ToggleRow
        label="Notifications"
        value={false}
        onValueChange={jest.fn()}
      />
    )
    expect(screen.queryByText('Receive push')).toBeNull()
  })

  it('renders icon when provided', () => {
    const icon = <Text testID="toggle-icon">Icon</Text>
    render(
      <ToggleRow
        label="Notifications"
        icon={icon}
        value={false}
        onValueChange={jest.fn()}
      />
    )
    expect(screen.getByTestId('toggle-icon')).toBeTruthy()
  })

  it('renders switch in off state', () => {
    const { toJSON } = render(
      <ToggleRow label="Setting" value={false} onValueChange={jest.fn()} />
    )
    expect(toJSON()).toBeTruthy()
  })

  it('renders switch in on state', () => {
    const { toJSON } = render(
      <ToggleRow label="Setting" value={true} onValueChange={jest.fn()} />
    )
    expect(toJSON()).toBeTruthy()
  })

  it('calls onValueChange when switch toggled', () => {
    const onValueChange = jest.fn()
    const { UNSAFE_getByType } = render(
      <ToggleRow label="Setting" value={false} onValueChange={onValueChange} />
    )

    // Find the Switch component and simulate value change
    const switchComponent = UNSAFE_getByType(require('react-native').Switch)
    fireEvent(switchComponent, 'valueChange', true)
    expect(onValueChange).toHaveBeenCalledWith(true)
  })

  it('applies disabled opacity when disabled', () => {
    const { toJSON } = render(
      <ToggleRow
        label="Setting"
        value={false}
        onValueChange={jest.fn()}
        disabled
      />
    )
    expect(toJSON()).toBeTruthy()
  })

  it('renders with all props', () => {
    const { toJSON } = render(
      <ToggleRow
        label="Complete Toggle"
        description="With all options"
        icon={<Text>Icon</Text>}
        value={true}
        onValueChange={jest.fn()}
      />
    )
    expect(toJSON()).toBeTruthy()
  })
})
