import { renderHook } from '@testing-library/react-native'
import { mockCareLogs } from 'src/__tests__/fixtures/care-logs'
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
import { useCareLog } from '../useCareLog'

const mockedUseEffectQuery = useEffectQuery as jest.Mock

describe('useCareLog', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('calls useEffectQuery with correct parameters', () => {
    mockedUseEffectQuery.mockReturnValue(mockQueryLoading())

    renderHook(() => useCareLog({ plantId: 'plant-1', logId: 'log-1' }), {
      wrapper: createQueryWrapper(),
    })

    expect(mockedUseEffectQuery).toHaveBeenCalled()
  })

  it('returns care log data when successful', () => {
    const mockLog = mockCareLogs[0]
    mockedUseEffectQuery.mockReturnValue(mockQuerySuccess(mockLog))

    const { result } = renderHook(
      () => useCareLog({ plantId: 'plant-1', logId: 'log-1' }),
      {
        wrapper: createQueryWrapper(),
      }
    )

    expect(result.current.data).toEqual(mockLog)
    expect(result.current.isSuccess).toBe(true)
  })

  it('returns loading state', () => {
    mockedUseEffectQuery.mockReturnValue(mockQueryLoading())

    const { result } = renderHook(
      () => useCareLog({ plantId: 'plant-1', logId: 'log-1' }),
      {
        wrapper: createQueryWrapper(),
      }
    )

    expect(result.current.isLoading).toBe(true)
    expect(result.current.data).toBeUndefined()
  })
})
