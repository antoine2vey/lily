import { renderHook } from '@testing-library/react-native'
import { mockFixedDate } from 'src/__tests__/utils/dates'
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
import { useChatHistory } from '../useChatHistory'

const mockedUseEffectQuery = useEffectQuery as jest.MockedFunction<
  typeof useEffectQuery
>

const mockChatMessages = [
  {
    id: 'msg-1',
    role: 'user' as const,
    content: 'Hello',
    createdAt: mockFixedDate(2024, 1, 1, 10, 0),
  },
  {
    id: 'msg-2',
    role: 'assistant' as const,
    content: 'Hi there!',
    createdAt: mockFixedDate(2024, 1, 1, 10, 1),
  },
]

describe('useChatHistory', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns query state properties', () => {
    mockedUseEffectQuery.mockReturnValue(mockQueryLoading())

    const { result } = renderHook(() => useChatHistory(), {
      wrapper: createQueryWrapper(),
    })

    expect(result.current).toHaveProperty('isLoading')
    expect(result.current).toHaveProperty('data')
    expect(result.current).toHaveProperty('initialMessages')
  })

  it('returns empty arrays when no plantId provided', () => {
    mockedUseEffectQuery.mockReturnValue(
      mockQuerySuccess({ items: [], total: 0 })
    )

    const { result } = renderHook(() => useChatHistory(), {
      wrapper: createQueryWrapper(),
    })

    expect(result.current.data).toEqual([])
    expect(result.current.initialMessages).toEqual([])
  })

  it('calls useEffectQuery with correct parameters', () => {
    mockedUseEffectQuery.mockReturnValue(mockQueryLoading())

    renderHook(() => useChatHistory('plant-1'), {
      wrapper: createQueryWrapper(),
    })

    expect(mockedUseEffectQuery).toHaveBeenCalledWith(
      'aiChat',
      'getChatHistory',
      expect.objectContaining({
        path: { plantId: 'plant-1' },
        urlParams: { page: '1', limit: '50' },
      }),
      expect.objectContaining({ enabled: true })
    )
  })

  it('disables query when no plantId provided', () => {
    mockedUseEffectQuery.mockReturnValue(mockQueryLoading())

    renderHook(() => useChatHistory(), {
      wrapper: createQueryWrapper(),
    })

    expect(mockedUseEffectQuery).toHaveBeenCalledWith(
      'aiChat',
      'getChatHistory',
      expect.objectContaining({
        path: { plantId: '' },
      }),
      expect.objectContaining({ enabled: false })
    )
  })

  it('returns data as array for display', () => {
    mockedUseEffectQuery.mockReturnValue(
      mockQuerySuccess({ items: mockChatMessages, total: 2 })
    )

    const { result } = renderHook(() => useChatHistory('plant-1'), {
      wrapper: createQueryWrapper(),
    })

    expect(Array.isArray(result.current.data)).toBe(true)
    expect(result.current.isLoading).toBe(false)
  })

  it('returns initialMessages as array for AI SDK', () => {
    mockedUseEffectQuery.mockReturnValue(
      mockQuerySuccess({ items: mockChatMessages, total: 2 })
    )

    const { result } = renderHook(() => useChatHistory('plant-1'), {
      wrapper: createQueryWrapper(),
    })

    expect(Array.isArray(result.current.initialMessages)).toBe(true)
  })

  it('reverses data for inverted FlatList display', () => {
    mockedUseEffectQuery.mockReturnValue(
      mockQuerySuccess({ items: mockChatMessages, total: 2 })
    )

    const { result } = renderHook(() => useChatHistory('plant-1'), {
      wrapper: createQueryWrapper(),
    })

    // Data should be reversed (last message first for inverted list)
    expect(result.current.data[0].id).toBe('msg-2')
    expect(result.current.data[1].id).toBe('msg-1')
  })

  it('keeps initialMessages in chronological order', () => {
    mockedUseEffectQuery.mockReturnValue(
      mockQuerySuccess({ items: mockChatMessages, total: 2 })
    )

    const { result } = renderHook(() => useChatHistory('plant-1'), {
      wrapper: createQueryWrapper(),
    })

    // initialMessages should be in chronological order (first message first)
    expect(result.current.initialMessages[0].id).toBe('msg-1')
    expect(result.current.initialMessages[1].id).toBe('msg-2')
  })

  it('transforms messages to correct format', () => {
    mockedUseEffectQuery.mockReturnValue(
      mockQuerySuccess({ items: mockChatMessages, total: 2 })
    )

    const { result } = renderHook(() => useChatHistory('plant-1'), {
      wrapper: createQueryWrapper(),
    })

    // Check display message format
    const displayMsg = result.current.data[0]
    expect(displayMsg).toHaveProperty('id')
    expect(displayMsg).toHaveProperty('role')
    expect(displayMsg).toHaveProperty('content')
    expect(displayMsg).toHaveProperty('createdAt')

    // Check initialMessage format (for AI SDK)
    const aiMsg = result.current.initialMessages[0]
    expect(aiMsg).toHaveProperty('id')
    expect(aiMsg).toHaveProperty('role')
    expect(aiMsg).toHaveProperty('content')
    expect(aiMsg).toHaveProperty('createdAt')
  })

  it('handles loading state', () => {
    mockedUseEffectQuery.mockReturnValue(mockQueryLoading())

    const { result } = renderHook(() => useChatHistory('plant-1'), {
      wrapper: createQueryWrapper(),
    })

    expect(result.current.isLoading).toBe(true)
  })
})
