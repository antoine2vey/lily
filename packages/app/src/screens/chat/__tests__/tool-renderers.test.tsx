import { fireEvent, render, screen } from '@testing-library/react-native'
import { Option } from 'effect'
import type React from 'react'
import {
  carePlanToolParts,
  diagnosisToolParts,
  toolReply,
  toolReplyText,
} from '@/__tests__/fixtures/chat-tool-parts'
import { ChatMessage } from '@/screens/chat/components/ChatMessage'
import { toolResultId } from '@/screens/chat/components/tool-renderers'

jest.useFakeTimers()

jest.mock('@/hooks/useCarePlans', () => ({
  usePlantCarePlans: jest.fn(() => ({ data: undefined })),
}))

jest.mock('@/hooks/useCarePlanMutations', () => ({
  useAcceptCarePlan: jest.fn(() => ({ mutate: jest.fn(), isPending: false })),
  useDismissCarePlan: jest.fn(() => ({ mutate: jest.fn(), isPending: false })),
}))

jest.mock('@/components/ui/templates/bottom-sheet', () => {
  const ReactMock = require('react')
  const { View: RNView } = require('react-native')

  const MockBottomSheet = ReactMock.forwardRef(
    (props: { children: React.ReactNode }, ref: React.Ref<unknown>) => {
      ReactMock.useImperativeHandle(ref, () => ({
        snapToIndex: jest.fn(),
        close: jest.fn(),
      }))
      return ReactMock.createElement(RNView, null, props.children)
    }
  )

  return { BottomSheet: MockBottomSheet }
})

describe('proposeCarePlan tool part', () => {
  it('shows the planning indicator while the input is available', () => {
    render(
      <ChatMessage message={toolReply(carePlanToolParts['input-available'])} />
    )

    expect(screen.getByText('Preparing a care plan...')).toBeTruthy()
    expect(screen.queryByText('View plan')).toBeNull()
  })

  it('shows the care plan card once the output is available', () => {
    render(
      <ChatMessage message={toolReply(carePlanToolParts['output-available'])} />
    )

    expect(screen.getByText('Recover from overwatering')).toBeTruthy()
    expect(screen.queryByText('Preparing a care plan...')).toBeNull()
    expect(screen.queryByText('Let the soil dry out')).toBeNull()

    fireEvent.press(screen.getByText('View plan'))

    expect(screen.getByText('Let the soil dry out')).toBeTruthy()
  })

  it('opens the care plan sheet on its own when it is the result to auto-open', () => {
    render(
      <ChatMessage
        message={toolReply(carePlanToolParts['output-available'])}
        autoOpenToolId="d4bc2aa7-722f-439c-85ba-296a0981f629"
      />
    )

    expect(screen.getByText('Let the soil dry out')).toBeTruthy()
    expect(screen.getByText('Add to tasks')).toBeTruthy()
  })

  it('shows only the reply text when the tool failed', () => {
    render(
      <ChatMessage message={toolReply(carePlanToolParts['output-error'])} />
    )

    expect(screen.getByText(toolReplyText)).toBeTruthy()
    expect(screen.queryByText('Preparing a care plan...')).toBeNull()
    expect(screen.queryByText('Recover from overwatering')).toBeNull()
    expect(screen.queryByText('View plan')).toBeNull()
  })
})

describe('createDiagnosis tool part', () => {
  it('shows the analyzing indicator while the input is available', () => {
    render(
      <ChatMessage message={toolReply(diagnosisToolParts['input-available'])} />
    )

    expect(screen.getByText('Analyzing...')).toBeTruthy()
    expect(screen.queryByText('View diagnosis')).toBeNull()
  })

  it('shows the diagnosis card with its treatment plan once the output is available', () => {
    render(
      <ChatMessage
        message={toolReply(diagnosisToolParts['output-available'])}
      />
    )

    expect(screen.getByText('Root rot')).toBeTruthy()
    expect(screen.getByText('HIGH')).toBeTruthy()
    expect(screen.queryByText('Analyzing...')).toBeNull()

    fireEvent.press(screen.getByText('View diagnosis'))

    expect(screen.getByText('Yellow leaves')).toBeTruthy()
    expect(screen.getByText('Repot in fresh soil')).toBeTruthy()
    expect(screen.getByText('Add to tasks')).toBeTruthy()
  })

  it('shows only the reply text when the tool failed', () => {
    render(
      <ChatMessage message={toolReply(diagnosisToolParts['output-error'])} />
    )

    expect(screen.getByText(toolReplyText)).toBeTruthy()
    expect(screen.queryByText('Analyzing...')).toBeNull()
    expect(screen.queryByText('Root rot')).toBeNull()
    expect(screen.queryByText('View diagnosis')).toBeNull()
  })
})

describe('toolResultId', () => {
  it('names the result to auto-open only once the output is available', () => {
    expect(toolResultId(diagnosisToolParts['output-available'])).toEqual(
      Option.some('0b6f3a52-1d8e-4c37-9a4e-5f2c8d7e6a10')
    )
    expect(toolResultId(carePlanToolParts['output-available'])).toEqual(
      Option.some('d4bc2aa7-722f-439c-85ba-296a0981f629')
    )
    expect(toolResultId(diagnosisToolParts['input-available'])).toEqual(
      Option.none()
    )
    expect(toolResultId(carePlanToolParts['output-error'])).toEqual(
      Option.none()
    )
  })
})
