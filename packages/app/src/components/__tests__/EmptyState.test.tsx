import { fireEvent, render, screen } from '@testing-library/react-native'
import { EmptyState } from '../EmptyState'

describe('EmptyState', () => {
  it('renders the clip and copy registered for its kind', () => {
    render(<EmptyState kind="notifications" />)
    expect(screen.getByTestId('mascot-bell')).toBeTruthy()
    expect(screen.getByText("You're all caught up!")).toBeTruthy()
    expect(
      screen.getByText("I'll ring as soon as a plant needs you.")
    ).toBeTruthy()
  })

  it('keeps the mascot in the inline variant', () => {
    render(<EmptyState kind="plantsNoResults" variant="inline" />)
    expect(screen.getByTestId('mascot-lookAround')).toBeTruthy()
    expect(screen.getByText('No plants found')).toBeTruthy()
  })

  it('calls action onPress when button pressed', () => {
    const onPress = jest.fn()
    render(
      <EmptyState kind="plantsNone" action={{ label: 'Add Plant', onPress }} />
    )

    fireEvent.press(screen.getByText('Add Plant'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })
})
