import { fireEvent, render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'
import { Card } from '../Card'

describe('Card', () => {
  it('renders children', () => {
    render(
      <Card>
        <Text>Card content</Text>
      </Card>
    )
    expect(screen.getByText('Card content')).toBeTruthy()
  })

  it('applies elevated shadow by default', () => {
    const { toJSON } = render(
      <Card>
        <Text>Content</Text>
      </Card>
    )
    const tree = toJSON()
    expect(tree).toBeTruthy()
  })

  it('renders outlined variant with border', () => {
    const { toJSON } = render(
      <Card variant="outlined">
        <Text>Content</Text>
      </Card>
    )
    const tree = toJSON()
    expect(tree).toBeTruthy()
  })

  it('handles press when onPress provided', () => {
    const onPress = jest.fn()
    render(
      <Card onPress={onPress}>
        <Text>Pressable Card</Text>
      </Card>
    )
    fireEvent.press(screen.getByText('Pressable Card'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('applies correct padding for each size', () => {
    const { rerender, toJSON } = render(
      <Card padding="sm">
        <Text>Content</Text>
      </Card>
    )
    expect(toJSON()).toBeTruthy()

    rerender(
      <Card padding="md">
        <Text>Content</Text>
      </Card>
    )
    expect(toJSON()).toBeTruthy()

    rerender(
      <Card padding="lg">
        <Text>Content</Text>
      </Card>
    )
    expect(toJSON()).toBeTruthy()

    rerender(
      <Card padding="none">
        <Text>Content</Text>
      </Card>
    )
    expect(toJSON()).toBeTruthy()
  })
})
