import { render, screen } from '@testing-library/react-native'
import type React from 'react'
import { Text } from 'react-native'

// Mock the reacticx BottomSheet to avoid reanimated/gesture-handler dependencies
jest.mock('src/components/ui/templates/bottom-sheet', () => {
  const ReactMock = require('react')
  const { View: RNView } = require('react-native')

  const MockBottomSheet = ReactMock.forwardRef(
    (props: { children: React.ReactNode }, ref: React.Ref<unknown>) => {
      ReactMock.useImperativeHandle(ref, () => ({
        snapToIndex: jest.fn(),
        snapToPosition: jest.fn(),
        expand: jest.fn(),
        collapse: jest.fn(),
        close: jest.fn(),
        getCurrentIndex: jest.fn(() => 0),
      }))

      return ReactMock.createElement(
        RNView,
        { testID: 'raw-bottom-sheet' },
        props.children
      )
    }
  )

  return { BottomSheet: MockBottomSheet }
})

import { BottomSheet } from '../BottomSheet'

describe('BottomSheet', () => {
  const defaultProps = {
    visible: true,
    onClose: jest.fn(),
    children: <Text>Sheet Content</Text>,
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders children when visible', () => {
    render(<BottomSheet {...defaultProps} />)
    expect(screen.getByText('Sheet Content')).toBeTruthy()
  })

  it('renders title when provided', () => {
    render(<BottomSheet {...defaultProps} title="Sheet Title" />)
    expect(screen.getByText('Sheet Title')).toBeTruthy()
  })

  it('does not render title when not provided', () => {
    render(<BottomSheet {...defaultProps} />)
    expect(screen.queryByText('Sheet Title')).toBeNull()
  })

  it('returns null when not visible', () => {
    const { toJSON } = render(<BottomSheet {...defaultProps} visible={false} />)
    expect(toJSON()).toBeNull()
  })

  it('renders with custom snap points', () => {
    const { toJSON } = render(
      <BottomSheet {...defaultProps} snapPoints={['75%']} />
    )
    expect(toJSON()).toBeTruthy()
  })

  it('renders with number snap point', () => {
    const { toJSON } = render(
      <BottomSheet {...defaultProps} snapPoints={[400]} />
    )
    expect(toJSON()).toBeTruthy()
  })

  it('renders with complex children', () => {
    render(
      <BottomSheet {...defaultProps}>
        <Text>Item 1</Text>
        <Text>Item 2</Text>
        <Text>Item 3</Text>
      </BottomSheet>
    )
    expect(screen.getByText('Item 1')).toBeTruthy()
    expect(screen.getByText('Item 2')).toBeTruthy()
    expect(screen.getByText('Item 3')).toBeTruthy()
  })
})
