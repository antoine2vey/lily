import { renderHook } from '@testing-library/react-native'

// Mock dependencies - must be before importing the module under test
jest.mock('expo/fetch', () => ({
  fetch: jest.fn().mockResolvedValue({
    ok: true,
    body: { getReader: jest.fn() },
  }),
}))

jest.mock('ai', () => ({
  DefaultChatTransport: jest.fn().mockImplementation(() => ({
    api: 'mock-api',
  })),
}))

jest.mock('@ai-sdk/react', () => ({
  useChat: jest.fn(() => ({
    messages: [],
    sendMessage: jest.fn(),
    status: 'ready',
    setMessages: jest.fn(),
    id: 'test-chat-id',
    error: undefined,
    stop: jest.fn(),
    regenerate: jest.fn(),
    resumeStream: jest.fn(),
    addToolResult: jest.fn(),
    addToolOutput: jest.fn(),
    addToolApprovalResponse: jest.fn(),
    clearError: jest.fn(),
  })),
}))

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue('mock-token'),
}))

import { useChat } from '@ai-sdk/react'
import type { UIMessage } from 'ai'
import { usePlantChat } from '../usePlantChat'

const mockedUseChat = useChat as jest.MockedFunction<typeof useChat>

// Helper to create a mock useChat return value with all required properties
const createMockUseChatReturn = (overrides = {}) =>
  ({
    messages: [],
    sendMessage: jest.fn(),
    status: 'ready',
    setMessages: jest.fn(),
    id: 'test-chat-id',
    error: undefined,
    stop: jest.fn(),
    regenerate: jest.fn(),
    resumeStream: jest.fn(),
    addToolResult: jest.fn(),
    addToolOutput: jest.fn(),
    addToolApprovalResponse: jest.fn(),
    clearError: jest.fn(),
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

  it('syncs initialMessages via setMessages when they load', () => {
    const mockSetMessages = jest.fn()
    mockedUseChat.mockReturnValue(
      createMockUseChatReturn({ setMessages: mockSetMessages })
    )

    const initialMessages: UIMessage[] = [
      {
        id: 'msg-1',
        role: 'user' as const,
        parts: [{ type: 'text' as const, text: 'Hello' }],
      },
    ]

    renderHook(() => usePlantChat({ plantId: 'plant-123', initialMessages }))

    expect(mockSetMessages).toHaveBeenCalledWith(initialMessages)
  })

  it('configures transport instead of streamProtocol', () => {
    renderHook(() =>
      usePlantChat({ plantId: 'plant-123', initialMessages: [] })
    )

    expect(mockedUseChat).toHaveBeenCalledWith(
      expect.objectContaining({
        transport: expect.any(Object),
      })
    )

    // Should NOT have streamProtocol (v1 API)
    const callArgs = mockedUseChat.mock.calls[0]?.[0]
    expect(callArgs).not.toHaveProperty('streamProtocol')
  })

  it('returns useChat hook result with pendingImageUrl ref', () => {
    const mockSendMessage = jest.fn()

    mockedUseChat.mockReturnValue(
      createMockUseChatReturn({
        messages: [
          {
            id: 'msg-1',
            role: 'assistant',
            parts: [{ type: 'text', text: 'Hello!' }],
          },
        ],
        sendMessage: mockSendMessage,
        status: 'ready',
      })
    )

    const { result } = renderHook(() =>
      usePlantChat({ plantId: 'plant-123', initialMessages: [] })
    )

    expect(result.current.messages).toHaveLength(1)
    expect(result.current.status).toBe('ready')
    expect(result.current.sendMessage).toBe(mockSendMessage)
    expect(result.current.pendingImageUrl).toBeDefined()
    expect(result.current.pendingImageUrl.current).toBeUndefined()
  })
})
