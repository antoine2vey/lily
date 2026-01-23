import { waitFor } from '@testing-library/react-native'
import { renderQueryHook } from 'src/__tests__/utils/query-helpers'
import { useChatHistory } from '../useChatHistory'

describe('useChatHistory', () => {
  it('returns loading state initially', () => {
    const { result } = renderQueryHook(() => useChatHistory())

    expect(result.current.isLoading).toBe(true)
  })

  it('returns chat messages when successful', async () => {
    const { result } = renderQueryHook(() => useChatHistory())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.data).toBeDefined()
    expect(Array.isArray(result.current.data)).toBe(true)
    expect(result.current.data?.length).toBeGreaterThan(0)
  })

  it('returns messages with correct structure', async () => {
    const { result } = renderQueryHook(() => useChatHistory())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    const firstMessage = result.current.data?.[0]
    expect(firstMessage).toHaveProperty('id')
    expect(firstMessage).toHaveProperty('role')
    expect(firstMessage).toHaveProperty('content')
    expect(firstMessage).toHaveProperty('createdAt')
  })

  it('accepts plantId parameter', async () => {
    const { result } = renderQueryHook(() => useChatHistory('plant-1'))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.data).toBeDefined()
  })
})
