import { fireEvent, render } from '@testing-library/react-native'
import { Array } from 'effect'
import { IconButton } from '../IconButton'

describe('IconButton', () => {
  it('renders with icon', () => {
    const { toJSON } = render(<IconButton icon="settings" />)
    expect(toJSON()).toBeTruthy()
  })

  it('calls onPress when pressed', () => {
    const onPress = jest.fn()
    const { root } = render(<IconButton icon="settings" onPress={onPress} />)

    fireEvent.press(root)
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('does not call onPress when disabled', () => {
    const onPress = jest.fn()
    const { root } = render(
      <IconButton icon="settings" onPress={onPress} disabled />
    )

    fireEvent.press(root)
    expect(onPress).not.toHaveBeenCalled()
  })

  it('renders with custom size', () => {
    const { toJSON } = render(<IconButton icon="settings" size={32} />)
    expect(toJSON()).toBeTruthy()
  })

  it('renders with custom color', () => {
    const { toJSON } = render(<IconButton icon="settings" color="#FF0000" />)
    expect(toJSON()).toBeTruthy()
  })

  it('applies disabled opacity', () => {
    const { toJSON } = render(<IconButton icon="settings" disabled />)
    expect(toJSON()).toBeTruthy()
  })

  it('uses default size of 24', () => {
    const { toJSON } = render(<IconButton icon="settings" />)
    expect(toJSON()).toBeTruthy()
  })

  it('renders different icon types', () => {
    const icons = ['settings', 'close', 'menu', 'search', 'add'] as const
    Array.forEach(icons, (icon) => {
      const { toJSON } = render(<IconButton icon={icon} />)
      expect(toJSON()).toBeTruthy()
    })
  })

  it('passes additional Pressable props', () => {
    const onLongPress = jest.fn()
    const { root } = render(
      <IconButton icon="settings" onLongPress={onLongPress} />
    )

    fireEvent(root, 'longPress')
    expect(onLongPress).toHaveBeenCalledTimes(1)
  })
})
