import type { ToolUIPart, UIMessage } from 'ai'

type RenderedToolState = 'input-available' | 'output-available' | 'output-error'

type ToolPartsByState = {
  readonly [S in RenderedToolState]: Extract<ToolUIPart, { state: S }>
}

const carePlanInput = {
  title: 'Recover from overwatering',
  steps: [{ title: 'Let the soil dry out', careType: 'none', dueInDays: 0 }],
}

export const carePlanToolParts: ToolPartsByState = {
  'input-available': {
    type: 'tool-proposeCarePlan',
    toolCallId: 'call_mock_1',
    state: 'input-available',
    input: carePlanInput,
  },
  'output-available': {
    type: 'tool-proposeCarePlan',
    toolCallId: 'call_mock_1',
    state: 'output-available',
    input: carePlanInput,
    output: {
      carePlanId: 'd4bc2aa7-722f-439c-85ba-296a0981f629',
      plantId: '85acc811-0937-4cd6-8f9c-57b73e5a9ff9',
    },
  },
  'output-error': {
    type: 'tool-proposeCarePlan',
    toolCallId: 'call_mock_1',
    state: 'output-error',
    input: carePlanInput,
    errorText: 'An error occurred.',
  },
}

const diagnosisInput = {
  diseaseName: 'Root rot',
  severity: 'HIGH',
  confidence: 80,
  symptoms: ['Yellow leaves', 'Wet soil'],
  treatmentSteps: [
    { title: 'Let the soil dry out', careType: 'none', dueInDays: 0 },
    { title: 'Repot in fresh soil', careType: 'repotting', dueInDays: 3 },
  ],
}

export const diagnosisToolParts: ToolPartsByState = {
  'input-available': {
    type: 'tool-createDiagnosis',
    toolCallId: 'call_mock_2',
    state: 'input-available',
    input: diagnosisInput,
  },
  'output-available': {
    type: 'tool-createDiagnosis',
    toolCallId: 'call_mock_2',
    state: 'output-available',
    input: diagnosisInput,
    output: {
      diagnosisId: '0b6f3a52-1d8e-4c37-9a4e-5f2c8d7e6a10',
      carePlanId: '7c1e9d24-3b5a-4f86-8e2d-1a9c6b4f3e07',
    },
  },
  'output-error': {
    type: 'tool-createDiagnosis',
    toolCallId: 'call_mock_2',
    state: 'output-error',
    input: diagnosisInput,
    errorText: 'An error occurred.',
  },
}

export const toolReplyText = 'Let the soil dry before you water again.'

export const toolReply = (part: ToolUIPart): UIMessage => ({
  id: 'assistant-1',
  role: 'assistant',
  parts: [
    { type: 'step-start' },
    part,
    { type: 'step-start' },
    { type: 'text', text: toolReplyText, state: 'done' },
  ],
})
