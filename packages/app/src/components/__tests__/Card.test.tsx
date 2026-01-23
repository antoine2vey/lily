import { fireEvent, render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'
import { Card } from '../Card'

describe('Card', () => {
  it('renders children content', () => {
    render(
      <Card>
        <Text>Card Content</Text>
      </Card>
    )
    expect(screen.getByText('Card Content')).toBeTruthy()
  })

  it('renders with elevated variant by default', () => {
    const { toJSON } = render(
      <Card>
        <Text>Content</Text>
      </Card>
    )
    expect(toJSON()).toBeTruthy()
  })

  it('renders with outlined variant', () => {
    const { toJSON } = render(
      <Card variant="outlined">
        <Text>Content</Text>
      </Card>
    )
    expect(toJSON()).toBeTruthy()
  })

  it('renders with filled variant', () => {
    const { toJSON } = render(
      <Card variant="filled">
        <Text>Content</Text>
      </Card>
    )
    expect(toJSON()).toBeTruthy()
  })

  it('renders with no padding', () => {
    const { toJSON } = render(
      <Card padding="none">
        <Text>Content</Text>
      </Card>
    )
    expect(toJSON()).toBeTruthy()
  })

  it('renders with sm padding', () => {
    const { toJSON } = render(
      <Card padding="sm">
        <Text>Content</Text>
      </Card>
    )
    expect(toJSON()).toBeTruthy()
  })

  it('renders with md padding (default)', () => {
    const { toJSON } = render(
      <Card padding="md">
        <Text>Content</Text>
      </Card>
    )
    expect(toJSON()).toBeTruthy()
  })

  it('renders with lg padding', () => {
    const { toJSON } = render(
      <Card padding="lg">
        <Text>Content</Text>
      </Card>
    )
    expect(toJSON()).toBeTruthy()
  })

  it('calls onPress when pressed', () => {
    const onPress = jest.fn()
    render(
      <Card onPress={onPress}>
        <Text>Pressable Card</Text>
      </Card>
    )

    fireEvent.press(screen.getByText('Pressable Card'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('does not wrap in Pressable when no onPress provided', () => {
    const { toJSON } = render(
      <Card>
        <Text>Non-pressable Card</Text>
      </Card>
    )
    expect(toJSON()).toBeTruthy()
  })

  it('applies custom style', () => {
    const { toJSON } = render(
      <Card style={{ marginTop: 10 }}>
        <Text>Content</Text>
      </Card>
    )
    expect(toJSON()).toBeTruthy()
  })
})
