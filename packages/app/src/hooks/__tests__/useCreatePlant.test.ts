import { renderHook } from '@testing-library/react-native'
import {
  createQueryWrapper,
  mockMutationSuccess,
} from 'src/__tests__/utils/query-helpers'

// Mock the client
jest.mock('@/utils/client', () => ({
  useEffectMutation: jest.fn(),
}))

import { useEffectMutation } from 'src/utils/client'
import { useCreatePlant } from '../useCreatePlant'

const mockedUseEffectMutation = useEffectMutation as jest.MockedFunction<
  typeof useEffectMutation
>

describe('useCreatePlant', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('calls useEffectMutation with correct parameters', () => {
    mockedUseEffectMutation.mockReturnValue(mockMutationSuccess())

    renderHook(() => useCreatePlant(), {
      wrapper: createQueryWrapper(),
    })

    expect(mockedUseEffectMutation).toHaveBeenCalledWith(
      'plants',
      'createPlant',
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
    mockedUseEffectMutation.mockReturnValue(mockMutation)

    const { result } = renderHook(() => useCreatePlant(), {
      wrapper: createQueryWrapper(),
    })

    expect(typeof result.current.mutate).toBe('function')
    expect(typeof result.current.mutateAsync).toBe('function')
  })

  it('provides mutation state', () => {
    const mockMutation = {
      mutate: jest.fn(),
      mutateAsync: jest.fn(),
      isLoading: false,
      isPending: false,
      isError: false,
      isSuccess: true,
    }
    mockedUseEffectMutation.mockReturnValue(mockMutation)

    const { result } = renderHook(() => useCreatePlant(), {
      wrapper: createQueryWrapper(),
    })

    expect(result.current.isSuccess).toBe(true)
    expect(result.current.isError).toBe(false)
  })
})
