import { mockNotifications } from '@lily/api/__tests__/fixtures/notifications'
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
import { useNotifications } from '../useNotifications'

const mockedUseEffectQuery = useEffectQuery as jest.MockedFunction<
  typeof useEffectQuery
>

describe('useNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('calls useEffectQuery with correct parameters', () => {
    mockedUseEffectQuery.mockReturnValue(mockQueryLoading() as any)

    renderHook(() => useNotifications(), {
      wrapper: createQueryWrapper(),
    })

    expect(mockedUseEffectQuery).toHaveBeenCalled()
  })

  it('returns notifications data when successful', () => {
    mockedUseEffectQuery.mockReturnValue(
      mockQuerySuccess(mockNotifications) as any
    )

    const { result } = renderHook(() => useNotifications(), {
      wrapper: createQueryWrapper(),
    })

    expect(result.current.data).toEqual(mockNotifications)
    expect(result.current.isSuccess).toBe(true)
  })

  it('returns loading state', () => {
    mockedUseEffectQuery.mockReturnValue(mockQueryLoading() as any)

    const { result } = renderHook(() => useNotifications(), {
      wrapper: createQueryWrapper(),
    })

    expect(result.current.isLoading).toBe(true)
    expect(result.current.data).toBeUndefined()
  })
})
