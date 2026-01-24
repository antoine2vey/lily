import { render } from '@testing-library/react-native'

// Mock the client early to prevent msgpackr import issues
jest.mock('@/utils/client', () => ({
  useEffectQuery: jest.fn(() => ({
    data: { items: [], total: 0 },
    isLoading: false,
  })),
  useEffectMutation: jest.fn(() => ({
    mutate: jest.fn(),
    isPending: false,
  })),
}))

// Mock hooks
jest.mock('@/hooks/usePlants', () => ({
  usePlants: jest.fn(() => ({
    data: { items: [], total: 0 },
    isLoading: false,
  })),
}))

jest.mock('@/hooks/useSaveCareLog', () => ({
  useSaveCareLog: jest.fn(() => ({
    mutate: jest.fn(),
    mutateAsync: jest.fn(),
    isPending: false,
    isSuccess: false,
  })),
}))

import { LogCareSheet } from '../LogCareSheet'

describe('LogCareSheet', () => {
  const mockOnClose = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders when visible', () => {
    const { toJSON } = render(
      <LogCareSheet visible={true} onClose={mockOnClose} />
    )
    expect(toJSON()).toBeTruthy()
  })

  it('does not render content when not visible', () => {
    const { toJSON } = render(
      <LogCareSheet visible={false} onClose={mockOnClose} />
    )
    // When not visible, modal returns null
    expect(toJSON()).toBeNull()
  })
})
