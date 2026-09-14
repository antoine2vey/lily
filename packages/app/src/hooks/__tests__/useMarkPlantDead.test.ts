import type { QueryClient } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react-native'
import {
  createQueryWrapper,
  createTestQueryClient,
  mockMutationSuccess,
} from '@/__tests__/utils/query-helpers'
import { queryKeys } from '@/utils/query-keys'

jest.mock('@/utils/client', () => ({
  useEffectMutation: jest.fn(),
}))

import { useEffectMutation } from '@/utils/client'
import { useMarkPlantDead } from '../useMarkPlantDead'

const mockedUseEffectMutation = useEffectMutation as jest.MockedFunction<
  typeof useEffectMutation
>

describe('useMarkPlantDead', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('targets the markPlantDead endpoint', () => {
    mockedUseEffectMutation.mockReturnValue(mockMutationSuccess())

    renderHook(() => useMarkPlantDead(), { wrapper: createQueryWrapper() })

    expect(mockedUseEffectMutation).toHaveBeenCalledWith(
      'plants',
      'markPlantDead',
      expect.any(Object)
    )
  })

  it('onSuccess invalidates plants, care tasks and care logs', () => {
    mockedUseEffectMutation.mockReturnValue(mockMutationSuccess())
    const queryClient: QueryClient = createTestQueryClient()
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries')

    renderHook(() => useMarkPlantDead(), {
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
      ])
    )
  })
})
