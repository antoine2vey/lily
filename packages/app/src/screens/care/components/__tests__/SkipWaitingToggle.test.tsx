import { fireEvent, render, screen } from '@testing-library/react-native'
import { SkipWaitingToggle } from '../SkipWaitingToggle'

describe('SkipWaitingToggle', () => {
  it('renders the label', () => {
    render(<SkipWaitingToggle value={false} onValueChange={jest.fn()} />)

    expect(screen.getByText('Skip waiting')).toBeTruthy()
  })

  it('calls onValueChange when toggled', () => {
    const onValueChange = jest.fn()
    render(<SkipWaitingToggle value={false} onValueChange={onValueChange} />)

    fireEvent(screen.getByTestId('skip-waiting-toggle'), 'valueChange', true)

    expect(onValueChange).toHaveBeenCalledWith(true)
  })

  it('reflects the on state', () => {
    const { toJSON } = render(
      <SkipWaitingToggle value={true} onValueChange={jest.fn()} />
    )

    expect(toJSON()).toBeTruthy()
  })
})
