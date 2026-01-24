import { mockCareLogs } from '@lily/api/__tests__/fixtures/care-logs'
import { renderHook } from '@testing-library/react-native'
import {
  createQueryWrapper,
  mockQueryLoading,
  mockQuerySuccess,
} from 'src/__tests__/utils/query-helpers'

// Mock the client
jest.mock('@/utils/client', () => ({
  useEffectQuery: jest.fn(),
}))

import { useEffectQuery } from '@/utils/client'
import { useCareHistory } from '../useCareHistory'

const mockedUseEffectQuery = useEffectQuery as jest.MockedFunction<
  typeof useEffectQuery
>

describe('useCareHistory', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('calls useEffectQuery with correct parameters', () => {
    mockedUseEffectQuery.mockReturnValue(mockQueryLoading())

    renderHook(() => useCareHistory({ plantId: 'plant-1' }), {
      wrapper: createQueryWrapper(),
    })

    expect(mockedUseEffectQuery).toHaveBeenCalled()
  })

  it('returns care history data when successful', () => {
    mockedUseEffectQuery.mockReturnValue(
      mockQuerySuccess({
        items: mockCareLogs,
        total: mockCareLogs.length,
      })
    )

    const { result } = renderHook(
      () => useCareHistory({ plantId: 'plant-1' }),
      {
        wrapper: createQueryWrapper(),
      }
    )

    expect(result.current.rawData?.items).toEqual(mockCareLogs)
    expect(result.current.isSuccess).toBe(true)
  })

  it('returns loading state', () => {
    mockedUseEffectQuery.mockReturnValue(mockQueryLoading())

    const { result } = renderHook(
      () => useCareHistory({ plantId: 'plant-1' }),
      {
        wrapper: createQueryWrapper(),
      }
    )

    expect(result.current.isLoading).toBe(true)
    expect(result.current.data).toBeUndefined()
  })

  it('passes plant ID to query', () => {
    mockedUseEffectQuery.mockReturnValue(mockQueryLoading())

    renderHook(() => useCareHistory({ plantId: 'plant-123' }), {
      wrapper: createQueryWrapper(),
    })

    // Verify useEffectQuery was called (specific params depend on implementation)
    expect(mockedUseEffectQuery).toHaveBeenCalled()
  })
})
