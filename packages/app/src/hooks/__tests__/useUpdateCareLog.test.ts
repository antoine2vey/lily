import { renderHook } from '@testing-library/react-native'
import {
  createQueryWrapper,
  mockMutationSuccess,
} from 'src/__tests__/utils/query-helpers'

// Mock the client
jest.mock('@/utils/client', () => ({
  useEffectMutation: jest.fn(),
}))

import { useEffectMutation } from '@/utils/client'
import { useUpdateCareLog } from '../useUpdateCareLog'

const mockedUseEffectMutation = useEffectMutation as jest.MockedFunction<
  typeof useEffectMutation
>

describe('useUpdateCareLog', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('calls useEffectMutation', () => {
    mockedUseEffectMutation.mockReturnValue(mockMutationSuccess())

    renderHook(() => useUpdateCareLog(), {
      wrapper: createQueryWrapper(),
    })

    expect(mockedUseEffectMutation).toHaveBeenCalled()
  })

  it('returns mutation functions', () => {
    const mockMutation = {
      ...mockMutationSuccess(),
      mutate: jest.fn(),
      mutateAsync: jest.fn(),
    }
    mockedUseEffectMutation.mockReturnValue(mockMutation)

    const { result } = renderHook(() => useUpdateCareLog(), {
      wrapper: createQueryWrapper(),
    })

    expect(typeof result.current.mutate).toBe('function')
    expect(typeof result.current.mutateAsync).toBe('function')
  })
})
