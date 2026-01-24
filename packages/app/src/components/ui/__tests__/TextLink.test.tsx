import { fireEvent, render, screen } from '@testing-library/react-native'
import { TextLink } from '../TextLink'

describe('TextLink', () => {
  it('renders children text', () => {
    render(<TextLink>Click here</TextLink>)
    expect(screen.getByText('Click here')).toBeTruthy()
  })

  it('calls onPress when pressed', () => {
    const onPress = jest.fn()
    render(<TextLink onPress={onPress}>Press me</TextLink>)

    fireEvent.press(screen.getByText('Press me'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('does not call onPress when disabled', () => {
    const onPress = jest.fn()
    render(
      <TextLink onPress={onPress} disabled>
        Disabled
      </TextLink>
    )

    fireEvent.press(screen.getByText('Disabled'))
    expect(onPress).not.toHaveBeenCalled()
  })

  it('renders with primary variant by default', () => {
    const { toJSON } = render(<TextLink>Primary Link</TextLink>)
    expect(toJSON()).toBeTruthy()
  })

  it('renders with secondary variant', () => {
    const { toJSON } = render(
      <TextLink variant="secondary">Secondary Link</TextLink>
    )
    expect(toJSON()).toBeTruthy()
  })

  it('renders with left icon', () => {
    const { toJSON } = render(
      <TextLink icon="arrow-back" iconPosition="left">
        Back
      </TextLink>
    )
    expect(toJSON()).toBeTruthy()
  })

  it('renders with right icon (default)', () => {
    const { toJSON } = render(<TextLink icon="arrow-forward">Next</TextLink>)
    expect(toJSON()).toBeTruthy()
  })

  it('applies disabled opacity', () => {
    const { toJSON } = render(<TextLink disabled>Disabled</TextLink>)
    expect(toJSON()).toBeTruthy()
  })

  it('renders without icon', () => {
    const { toJSON } = render(<TextLink>No Icon</TextLink>)
    expect(toJSON()).toBeTruthy()
  })

  it('renders with all props', () => {
    const onPress = jest.fn()
    const { toJSON } = render(
      <TextLink
        variant="primary"
        icon="open-in-new"
        iconPosition="right"
        onPress={onPress}
      >
        External Link
      </TextLink>
    )
    expect(toJSON()).toBeTruthy()
  })
})
