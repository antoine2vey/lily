import { renderHook } from '@testing-library/react-native'
import {
  createQueryWrapper,
  mockMutationSuccess,
} from 'src/__tests__/utils/query-helpers'

// Mock the client
jest.mock('@/utils/client', () => ({
  useEffectMutation: jest.fn(),
}))

import { useWaterAll } from 'src/hooks/useWaterAll'
import { useEffectMutation } from 'src/utils/client'

const mockedUseEffectMutation = useEffectMutation as jest.MockedFunction<
  typeof useEffectMutation
>

// Mock query client
const mockInvalidateQueries = jest.fn()
jest.mock('@tanstack/react-query', () => {
  const actual = jest.requireActual('@tanstack/react-query')
  return {
    ...actual,
    useQueryClient: () => ({
      invalidateQueries: mockInvalidateQueries,
    }),
  }
})

describe('useWaterAll', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedUseEffectMutation.mockReturnValue(mockMutationSuccess())
  })

  it('should call useEffectMutation with correct parameters', () => {
    renderHook(() => useWaterAll(), {
      wrapper: createQueryWrapper(),
    })

    expect(mockedUseEffectMutation).toHaveBeenCalledWith(
      'plants',
      'waterMultiplePlants',
      expect.objectContaining({
        onSuccess: expect.any(Function),
      })
    )
  })

  it('should return mutation object with correct properties', () => {
    const mockMutation = {
      ...mockMutationSuccess(),
      mutate: jest.fn(),
      mutateAsync: jest.fn(),
    }
    mockedUseEffectMutation.mockReturnValue(mockMutation)

    const { result } = renderHook(() => useWaterAll(), {
      wrapper: createQueryWrapper(),
    })

    expect(result.current).toHaveProperty('mutate')
    expect(result.current).toHaveProperty('mutateAsync')
    expect(result.current).toHaveProperty('isPending')
    expect(result.current).toHaveProperty('isSuccess')
    expect(result.current).toHaveProperty('isError')
  })

  it('should invalidate queries on success', () => {
    // Get the onSuccess callback from the mock call
    mockedUseEffectMutation.mockImplementation((_section, _method, options) => {
      // Simulate calling onSuccess
      if (options?.onSuccess) {
        options.onSuccess(
          undefined as never,
          undefined as never,
          undefined,
          undefined as never
        )
      }
      return mockMutationSuccess()
    })

    renderHook(() => useWaterAll(), {
      wrapper: createQueryWrapper(),
    })

    // Verify all queries are invalidated
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['plants', 'getPlant'],
    })
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['plants', 'getPlants'],
    })
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['careLogs'],
    })
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['careTasks'],
    })
  })

  it('should not invalidate queries when mutation is in error state', () => {
    mockedUseEffectMutation.mockReturnValue({
      ...mockMutationSuccess(),
      isPending: false,
      isSuccess: false,
      isError: true,
      error: new Error('Mutation failed'),
    })

    renderHook(() => useWaterAll(), {
      wrapper: createQueryWrapper(),
    })

    // onSuccess should not be called on error
    expect(mockInvalidateQueries).not.toHaveBeenCalled()
  })
})
