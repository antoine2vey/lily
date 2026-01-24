import { waitFor } from '@testing-library/react-native'
import { renderQueryHook } from 'src/__tests__/utils/query-helpers'
import { useChatHistory } from '../useChatHistory'

describe('useChatHistory', () => {
  it('returns query state properties', () => {
    const { result } = renderQueryHook(() => useChatHistory())

    // Should have standard query properties
    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('data')
    expect(result.current).toHaveProperty('initialMessages')
  })

  it('returns empty arrays when no plantId provided', async () => {
    const { result } = renderQueryHook(() => useChatHistory())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    // Without plantId, query is disabled and returns empty arrays
    expect(result.current.data).toEqual([])
    expect(result.current.initialMessages).toEqual([])
  })

  it('returns data as array for display', async () => {
    const { result } = renderQueryHook(() => useChatHistory('plant-1'))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(Array.isArray(result.current.data)).toBe(true)
  })

  it('returns initialMessages as array for AI SDK', async () => {
    const { result } = renderQueryHook(() => useChatHistory('plant-1'))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(Array.isArray(result.current.initialMessages)).toBe(true)
  })

  it('accepts plantId parameter and enables query', async () => {
    const { result } = renderQueryHook(() => useChatHistory('plant-1'))

    // With plantId, query should be enabled
    expect(result.current).toHaveProperty('data')
    expect(result.current).toHaveProperty('initialMessages')

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
  })
})
