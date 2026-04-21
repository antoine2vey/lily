import type { QueryClient } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react-native'
import {
  createQueryWrapper,
  createTestQueryClient,
  mockMutationSuccess,
} from '@/__tests__/utils/query-helpers'
import { queryKeys } from '@/utils/query-keys'

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
    mockedUseEffectMutation.mockReturnValue(mockMutationSuccess())

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
    mockedUseEffectMutation.mockReturnValue(mockMutation)

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
    mockedUseEffectMutation.mockReturnValue(mockMutation)

    const { result } = renderHook(() => useDeletePlant(), {
      wrapper: createQueryWrapper(),
    })

    expect(result.current.isPending).toBe(true)
  })

  it('onSuccess invalidates homepage queries (plants, careTasks, careLogs, achievements)', () => {
    mockedUseEffectMutation.mockReturnValue(mockMutationSuccess())
    const queryClient: QueryClient = createTestQueryClient()
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')

    renderHook(() => useDeletePlant(), {
      wrapper: createQueryWrapper(queryClient),
    })

    const options = mockedUseEffectMutation.mock.calls[0]?.[2]
    const onSuccess = options?.onSuccess as (() => void) | undefined
    onSuccess?.()

    const invalidatedKeys = invalidateSpy.mock.calls.map((call) => call[0])
    expect(invalidatedKeys).toEqual(
      expect.arrayContaining([
        { queryKey: queryKeys.plants.all },
        { queryKey: queryKeys.careTasks.all },
        { queryKey: queryKeys.careLogs.all },
        { queryKey: queryKeys.achievements.all },
      ])
    )
  })
})
