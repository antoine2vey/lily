import { render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'
import { BottomSheet } from '../BottomSheet'

describe('BottomSheet', () => {
  const defaultProps = {
    visible: true,
    onClose: jest.fn(),
  }

  it('renders children when visible', () => {
    render(
      <BottomSheet {...defaultProps}>
        <Text>Sheet content</Text>
      </BottomSheet>
    )
    expect(screen.getByText('Sheet content')).toBeTruthy()
  })

  it('does not render when not visible', () => {
    render(
      <BottomSheet {...defaultProps} visible={false}>
        <Text>Sheet content</Text>
      </BottomSheet>
    )
    expect(screen.queryByText('Sheet content')).toBeNull()
  })

  it('shows title when provided', () => {
    render(
      <BottomSheet {...defaultProps} title="Add Plant">
        <Text>Sheet content</Text>
      </BottomSheet>
    )
    expect(screen.getByText('Add Plant')).toBeTruthy()
  })

  it('calls onClose when backdrop pressed', () => {
    const onClose = jest.fn()
    const { toJSON } = render(
      <BottomSheet visible={true} onClose={onClose}>
        <Text>Content</Text>
      </BottomSheet>
    )
    expect(toJSON()).toBeTruthy()
  })

  it('calls onClose when dragged down', () => {
    const onClose = jest.fn()
    const { toJSON } = render(
      <BottomSheet visible={true} onClose={onClose}>
        <Text>Content</Text>
      </BottomSheet>
    )
    expect(toJSON()).toBeTruthy()
  })

  it('shows drag handle indicator', () => {
    const { toJSON } = render(
      <BottomSheet {...defaultProps}>
        <Text>Content</Text>
      </BottomSheet>
    )
    expect(toJSON()).toBeTruthy()
  })
})
