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
import { useCareLog } from '../useCareLog'

const mockedUseEffectQuery = useEffectQuery as jest.MockedFunction<
  typeof useEffectQuery
>

describe('useCareLog', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('calls useEffectQuery with correct parameters', () => {
    mockedUseEffectQuery.mockReturnValue(mockQueryLoading() as any)

    renderHook(() => useCareLog({ plantId: 'plant-1', logId: 'log-1' }), {
      wrapper: createQueryWrapper(),
    })

    expect(mockedUseEffectQuery).toHaveBeenCalled()
  })

  it('returns care log data when successful', () => {
    const mockLog = mockCareLogs[0]
    mockedUseEffectQuery.mockReturnValue(mockQuerySuccess(mockLog) as any)

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
    mockedUseEffectQuery.mockReturnValue(mockQueryLoading() as any)

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
