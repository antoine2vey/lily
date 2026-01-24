import { act, renderHook, waitFor } from '@testing-library/react-native'
import {
  createQueryWrapper,
  mockMutationSuccess,
} from 'src/__tests__/utils/query-helpers'

// Mock the client
jest.mock('@/utils/client', () => ({
  useEffectMutation: jest.fn(),
}))

import { useEffectMutation } from '@/utils/client'
import { useWaterPlant } from '../useWaterPlant'

const mockedUseEffectMutation = useEffectMutation as jest.MockedFunction<
  typeof useEffectMutation
>

describe('useWaterPlant', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('calls useEffectMutation with correct parameters', () => {
    mockedUseEffectMutation.mockReturnValue(mockMutationSuccess() as any)

    renderHook(() => useWaterPlant(), {
      wrapper: createQueryWrapper(),
    })

    expect(mockedUseEffectMutation).toHaveBeenCalledWith(
      'plants',
      'waterPlant',
      expect.objectContaining({
        onSuccess: expect.any(Function),
      })
    )
  })

  it('returns mutation functions', () => {
    const mockMutation = {
      ...mockMutationSuccess(),
      mutate: jest.fn(),
      mutateAsync: jest.fn(),
    }
    mockedUseEffectMutation.mockReturnValue(mockMutation as any)

    const { result } = renderHook(() => useWaterPlant(), {
      wrapper: createQueryWrapper(),
    })

    expect(typeof result.current.mutate).toBe('function')
    expect(typeof result.current.mutateAsync).toBe('function')
  })

  it('provides loading state', () => {
    const mockMutation = {
      mutate: jest.fn(),
      mutateAsync: jest.fn(),
      isPending: false,
      isError: false,
      isSuccess: false,
    }
    mockedUseEffectMutation.mockReturnValue(mockMutation as any)

    const { result } = renderHook(() => useWaterPlant(), {
      wrapper: createQueryWrapper(),
    })

    expect(result.current.isPending).toBe(false)
  })
})
