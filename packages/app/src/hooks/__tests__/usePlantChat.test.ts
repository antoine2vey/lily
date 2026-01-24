import { renderHook } from '@testing-library/react-native'

// Mock dependencies - must be before importing the module under test
jest.mock('expo/fetch', () => ({
  fetch: jest.fn().mockResolvedValue({
    ok: true,
    body: { getReader: jest.fn() },
  }),
}))

jest.mock('@ai-sdk/react', () => ({
  useChat: jest.fn(() => ({
    messages: [],
    input: '',
    handleInputChange: jest.fn(),
    handleSubmit: jest.fn(),
    isLoading: false,
    setInput: jest.fn(),
    append: jest.fn(),
    reload: jest.fn(),
    stop: jest.fn(),
    setMessages: jest.fn(),
  })),
}))

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue('mock-token'),
}))

import { useChat } from '@ai-sdk/react'
import { usePlantChat } from '../usePlantChat'

const mockedUseChat = useChat as jest.MockedFunction<typeof useChat>

// Helper to create a mock useChat return value with all required properties
const createMockUseChatReturn = (overrides = {}) =>
  ({
    messages: [],
    input: '',
    handleInputChange: jest.fn(),
    handleSubmit: jest.fn(),
    isLoading: false,
    setInput: jest.fn(),
    append: jest.fn(),
    reload: jest.fn(),
    stop: jest.fn(),
    setMessages: jest.fn(),
    error: undefined,
    status: 'ready',
    id: 'test-chat-id',
    setData: jest.fn(),
    data: undefined,
    addToolResult: jest.fn(),
    experimental_resume: jest.fn(),
    ...overrides,
  }) as unknown as ReturnType<typeof useChat>

describe('usePlantChat', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockedUseChat.mockReturnValue(createMockUseChatReturn())
  })

  it('calls useChat with correct plantId-based chat ID', () => {
    renderHook(() =>
      usePlantChat({ plantId: 'plant-123', initialMessages: [] })
    )

    expect(mockedUseChat).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'plant-chat-plant-123',
      })
    )
  })

  it('passes initialMessages to useChat', () => {
    const initialMessages = [
      {
        id: 'msg-1',
        role: 'user' as const,
        content: 'Hello',
        createdAt: new Date(),
      },
    ]

    renderHook(() => usePlantChat({ plantId: 'plant-123', initialMessages }))

    expect(mockedUseChat).toHaveBeenCalledWith(
      expect.objectContaining({
        initialMessages,
      })
    )
  })

  it('configures text stream protocol', () => {
    renderHook(() =>
      usePlantChat({ plantId: 'plant-123', initialMessages: [] })
    )

    expect(mockedUseChat).toHaveBeenCalledWith(
      expect.objectContaining({
        streamProtocol: 'text',
      })
    )
  })

  it('returns useChat hook result', () => {
    const mockHandleSubmit = jest.fn()
    const mockSetInput = jest.fn()

    mockedUseChat.mockReturnValue(
      createMockUseChatReturn({
        messages: [
          {
            id: 'msg-1',
            role: 'assistant',
            content: 'Hello!',
            createdAt: new Date(),
            parts: [{ type: 'text', text: 'Hello!' }],
          },
        ],
        input: 'test',
        handleSubmit: mockHandleSubmit,
        isLoading: true,
        setInput: mockSetInput,
      })
    )

    const { result } = renderHook(() =>
      usePlantChat({ plantId: 'plant-123', initialMessages: [] })
    )

    expect(result.current.messages).toHaveLength(1)
    expect(result.current.isLoading).toBe(true)
    expect(result.current.handleSubmit).toBe(mockHandleSubmit)
    expect(result.current.setInput).toBe(mockSetInput)
  })
})
