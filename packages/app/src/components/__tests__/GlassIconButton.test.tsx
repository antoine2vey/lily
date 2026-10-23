import { fireEvent, render, screen } from '@testing-library/react-native'
import { GlassIconButton } from '../GlassIconButton'

describe('GlassIconButton', () => {
  it('exposes its label as a named button', () => {
    const onPress = jest.fn()
    render(
      <GlassIconButton
        icon="settings"
        iconColor="#000"
        onPress={onPress}
        accessibilityLabel="Settings"
      />
    )

    fireEvent.press(screen.getByRole('button', { name: 'Settings' }))
    expect(onPress).toHaveBeenCalledTimes(1)
  })
})
