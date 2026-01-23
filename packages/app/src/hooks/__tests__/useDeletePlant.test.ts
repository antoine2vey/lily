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
import { useDeletePlant } from '../useDeletePlant'

const mockedUseEffectMutation = useEffectMutation as jest.MockedFunction<
  typeof useEffectMutation
>

describe('useDeletePlant', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('calls useEffectMutation with correct parameters', () => {
    mockedUseEffectMutation.mockReturnValue(mockMutationSuccess() as any)

    renderHook(() => useDeletePlant(), {
      wrapper: createQueryWrapper(),
    })

    expect(mockedUseEffectMutation).toHaveBeenCalledWith(
      'plants',
      'deletePlant',
      expect.any(Object)
    )
  })

  it('returns mutation functions', () => {
    const mockMutation = {
      ...mockMutationSuccess(),
      mutate: jest.fn(),
      mutateAsync: jest.fn(),
    }
    mockedUseEffectMutation.mockReturnValue(mockMutation as any)

    const { result } = renderHook(() => useDeletePlant(), {
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
      isPending: true,
      isError: false,
      isSuccess: false,
    }
    mockedUseEffectMutation.mockReturnValue(mockMutation as any)

    const { result } = renderHook(() => useDeletePlant(), {
      wrapper: createQueryWrapper(),
    })

    expect(result.current.isPending).toBe(true)
  })
})
