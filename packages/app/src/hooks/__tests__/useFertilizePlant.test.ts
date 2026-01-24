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
import { useFertilizePlant } from '../useFertilizePlant'

const mockedUseEffectMutation = useEffectMutation as jest.MockedFunction<
  typeof useEffectMutation
>

describe('useFertilizePlant', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('calls useEffectMutation with correct parameters', () => {
    mockedUseEffectMutation.mockReturnValue(mockMutationSuccess() as any)

    renderHook(() => useFertilizePlant(), {
      wrapper: createQueryWrapper(),
    })

    expect(mockedUseEffectMutation).toHaveBeenCalledWith(
      'plants',
      'fertilizePlant',
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

    const { result } = renderHook(() => useFertilizePlant(), {
      wrapper: createQueryWrapper(),
    })

    expect(typeof result.current.mutate).toBe('function')
    expect(typeof result.current.mutateAsync).toBe('function')
  })

  it('provides state properties', () => {
    const mockMutation = {
      mutate: jest.fn(),
      mutateAsync: jest.fn(),
      isPending: false,
      isError: false,
      isSuccess: false,
    }
    mockedUseEffectMutation.mockReturnValue(mockMutation as any)

    const { result } = renderHook(() => useFertilizePlant(), {
      wrapper: createQueryWrapper(),
    })

    expect(result.current.isPending).toBeDefined()
    expect(result.current.isError).toBeDefined()
  })
})
