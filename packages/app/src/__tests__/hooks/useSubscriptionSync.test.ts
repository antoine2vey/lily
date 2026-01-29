import { act, renderHook } from '@testing-library/react-native'
import { createQueryWrapper } from 'src/__tests__/utils/query-helpers'
import { useSubscriptionSync } from 'src/hooks/useSubscriptionSync'

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

describe('useSubscriptionSync', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should return syncSubscription function', () => {
    const { result } = renderHook(() => useSubscriptionSync(), {
      wrapper: createQueryWrapper(),
    })

    expect(result.current).toHaveProperty('syncSubscription')
    expect(typeof result.current.syncSubscription).toBe('function')
  })

  it('should invalidate subscription query when syncSubscription is called', () => {
    const { result } = renderHook(() => useSubscriptionSync(), {
      wrapper: createQueryWrapper(),
    })

    act(() => {
      result.current.syncSubscription()
    })

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['subscriptions', 'getCurrentSubscription'],
    })
  })

  it('should invalidate subscription query multiple times on multiple calls', () => {
    const { result } = renderHook(() => useSubscriptionSync(), {
      wrapper: createQueryWrapper(),
    })

    act(() => {
      result.current.syncSubscription()
      result.current.syncSubscription()
      result.current.syncSubscription()
    })

    expect(mockInvalidateQueries).toHaveBeenCalledTimes(3)
  })
})
