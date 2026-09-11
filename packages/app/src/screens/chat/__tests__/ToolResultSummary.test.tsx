import { fireEvent, render, screen } from '@testing-library/react-native'
import type React from 'react'
import { Text } from 'react-native'

// Flush requestAnimationFrame synchronously so the BottomSheet effect does
// not leak into a torn-down Jest environment.
jest.useFakeTimers()

jest.mock('@/components/ui/templates/bottom-sheet', () => {
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

import { ToolResultSummary } from '../components/ToolResultSummary'

describe('ToolResultSummary', () => {
  it('shows the compact row and keeps the details hidden until opened', () => {
    render(
      <ToolResultSummary
        testID="summary"
        icon="healing"
        title="Pucerons"
        subtitle="Diagnosis · 4 treatment steps"
        buttonLabel="View diagnosis"
        sheetTitle="Pucerons"
      >
        <Text>Full diagnosis content</Text>
      </ToolResultSummary>
    )

    expect(screen.getByText('Pucerons')).toBeTruthy()
    expect(screen.getByText('Diagnosis · 4 treatment steps')).toBeTruthy()
    expect(screen.queryByText('Full diagnosis content')).toBeNull()

    fireEvent.press(screen.getByTestId('summary-open'))

    expect(screen.getByText('Full diagnosis content')).toBeTruthy()
    expect(screen.getByTestId('raw-bottom-sheet')).toBeTruthy()
  })

  it('opens on its own when autoOpen is set and reports when closed', () => {
    const onHandled = jest.fn()
    render(
      <ToolResultSummary
        testID="summary"
        icon="checklist"
        title="Recovery"
        buttonLabel="View plan"
        sheetTitle="Care plan"
        autoOpen
        onAutoOpenHandled={onHandled}
      >
        <Text>Full plan content</Text>
      </ToolResultSummary>
    )

    expect(screen.getByText('Full plan content')).toBeTruthy()
    expect(onHandled).not.toHaveBeenCalled()
  })
})
