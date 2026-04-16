import { renderHook } from '@testing-library/react-native'
import { mockPlantsForCareTasks } from '@/__tests__/fixtures/care-tasks'
import {
  createQueryWrapper,
  mockQueryLoading,
  mockQuerySuccess,
} from '@/__tests__/utils/query-helpers'

// Mock the client
jest.mock('@/utils/client', () => ({
  useEffectQuery: jest.fn(),
}))

import { useEffectQuery } from '@/utils/client'
import { useCareTasks } from '../useCareTasks'

const mockedUseEffectQuery = useEffectQuery as jest.Mock

describe('useCareTasks', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('calls useEffectQuery with correct parameters', () => {
    mockedUseEffectQuery.mockReturnValue(mockQueryLoading())

    renderHook(() => useCareTasks(), {
      wrapper: createQueryWrapper(),
    })

    expect(mockedUseEffectQuery).toHaveBeenCalledWith(
      'careTasks',
      'getCareTasks',
      {}
    )
  })

  it('returns care tasks data when successful', () => {
    const mockTasks = {
      overdue: [mockPlantsForCareTasks[0]],
      today: [mockPlantsForCareTasks[1]],
      upcoming: [mockPlantsForCareTasks[2], mockPlantsForCareTasks[3]],
    }
    mockedUseEffectQuery.mockReturnValue(mockQuerySuccess(mockTasks))

    const { result } = renderHook(() => useCareTasks(), {
      wrapper: createQueryWrapper(),
    })

    expect(result.current.data).toEqual(mockTasks)
    expect(result.current.isSuccess).toBe(true)
  })

  it('returns loading state', () => {
    mockedUseEffectQuery.mockReturnValue(mockQueryLoading())

    const { result } = renderHook(() => useCareTasks(), {
      wrapper: createQueryWrapper(),
    })

    expect(result.current.isLoading).toBe(true)
    expect(result.current.data).toBeUndefined()
  })
})
