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
import { useDeleteCareLog } from '../useDeleteCareLog'

const mockedUseEffectMutation = useEffectMutation as jest.MockedFunction<
  typeof useEffectMutation
>

describe('useDeleteCareLog', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('calls useEffectMutation', () => {
    mockedUseEffectMutation.mockReturnValue(mockMutationSuccess() as any)

    renderHook(() => useDeleteCareLog(), {
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
    mockedUseEffectMutation.mockReturnValue(mockMutation as any)

    const { result } = renderHook(() => useDeleteCareLog(), {
      wrapper: createQueryWrapper(),
    })

    expect(typeof result.current.mutate).toBe('function')
    expect(typeof result.current.mutateAsync).toBe('function')
  })
})
