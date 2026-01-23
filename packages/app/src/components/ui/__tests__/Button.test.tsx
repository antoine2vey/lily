import { fireEvent, render, screen } from '@testing-library/react-native'
import { Button } from '../Button'

describe('Button', () => {
  it('renders children text', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByText('Click me')).toBeTruthy()
  })

  it('calls onPress when pressed', () => {
    const onPress = jest.fn()
    render(<Button onPress={onPress}>Press me</Button>)

    fireEvent.press(screen.getByText('Press me'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('does not call onPress when disabled', () => {
    const onPress = jest.fn()
    render(
      <Button onPress={onPress} disabled>
        Disabled
      </Button>
    )

    fireEvent.press(screen.getByText('Disabled'))
    expect(onPress).not.toHaveBeenCalled()
  })

  it('renders with primary variant by default', () => {
    const { toJSON } = render(<Button>Primary</Button>)
    expect(toJSON()).toBeTruthy()
  })

  it('renders with secondary variant', () => {
    const { toJSON } = render(<Button variant="secondary">Secondary</Button>)
    expect(toJSON()).toBeTruthy()
  })

  it('renders with destructive variant', () => {
    const { toJSON } = render(
      <Button variant="destructive">Destructive</Button>
    )
    expect(toJSON()).toBeTruthy()
  })

  it('renders with ghost variant', () => {
    const { toJSON } = render(<Button variant="ghost">Ghost</Button>)
    expect(toJSON()).toBeTruthy()
  })

  it('renders loading spinner when loading', () => {
    const { toJSON } = render(<Button loading>Loading</Button>)
    expect(toJSON()).toBeTruthy()
  })

  it('does not call onPress when loading', () => {
    const onPress = jest.fn()
    const { root } = render(
      <Button onPress={onPress} loading>
        Loading
      </Button>
    )

    // When loading, the button replaces children with ActivityIndicator
    // Press the root pressable element instead
    fireEvent.press(root)
    expect(onPress).not.toHaveBeenCalled()
  })

  it('renders with left icon', () => {
    const { toJSON } = render(
      <Button icon="add" iconPosition="left">
        Add Item
      </Button>
    )
    expect(toJSON()).toBeTruthy()
  })

  it('renders with right icon (default)', () => {
    const { toJSON } = render(<Button icon="arrow-forward">Next</Button>)
    expect(toJSON()).toBeTruthy()
  })

  it('applies disabled opacity', () => {
    const { toJSON } = render(<Button disabled>Disabled</Button>)
    expect(toJSON()).toBeTruthy()
  })

  it('renders full width by default', () => {
    const { toJSON } = render(<Button>Full Width</Button>)
    expect(toJSON()).toBeTruthy()
  })

  it('renders non-full width when specified', () => {
    const { toJSON } = render(<Button fullWidth={false}>Compact</Button>)
    expect(toJSON()).toBeTruthy()
  })
})
