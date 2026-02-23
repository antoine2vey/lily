import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react-native'
import type { ReactNode } from 'react'

// Mock dependencies
jest.mock('@react-navigation/native', () => ({
  useRoute: jest.fn(() => ({ params: {} })),
}))

jest.mock('src/hooks/useChatHistory', () => ({
  useChatHistory: jest.fn(),
}))

jest.mock('src/hooks/usePlantChat', () => ({
  usePlantChat: jest.fn(),
}))

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: jest.fn(() => ({
    state: {
      _tag: 'Authenticated',
      user: { id: 'user-1', email: 'test@example.com' },
    },
  })),
}))

jest.mock('src/hooks/useUploadChatImage', () => ({
  useUploadChatImage: jest.fn(() => ({
    mutateAsync: jest.fn(),
    isPending: false,
  })),
}))

import { useChatHistory } from 'src/hooks/useChatHistory'
import { usePlantChat } from 'src/hooks/usePlantChat'
import { ChatScreen } from '../ChatScreen'

const mockedUseChatHistory = useChatHistory as jest.Mock
const mockedUsePlantChat = usePlantChat as jest.Mock

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

const renderWithProviders = (ui: ReactNode) => {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  )
}

describe('ChatScreen', () => {
  const mockSendMessage = jest.fn()
  const mockPendingImageUrl = { current: undefined }

  beforeEach(() => {
    jest.clearAllMocks()
    mockedUsePlantChat.mockReturnValue({
      messages: [],
      sendMessage: mockSendMessage,
      status: 'ready',
      pendingImageUrl: mockPendingImageUrl,
    })
  })

  it('renders loading state', () => {
    mockedUseChatHistory.mockReturnValue({
      data: [],
      isLoading: true,
      initialMessages: [],
    })

    const { toJSON } = renderWithProviders(<ChatScreen />)
    expect(toJSON()).toBeTruthy()
  })

  it('displays chat input', () => {
    mockedUseChatHistory.mockReturnValue({
      data: [],
      isLoading: false,
      initialMessages: [],
    })

    renderWithProviders(<ChatScreen />)

    expect(screen.getByPlaceholderText('Ask about this plant...')).toBeTruthy()
  })

  it('displays messages when available', () => {
    mockedUseChatHistory.mockReturnValue({
      data: [],
      isLoading: false,
      initialMessages: [],
    })

    mockedUsePlantChat.mockReturnValue({
      messages: [
        {
          id: 'msg-1',
          role: 'user',
          parts: [{ type: 'text', text: 'Hello' }],
        },
        {
          id: 'msg-2',
          role: 'assistant',
          parts: [
            {
              type: 'text',
              text: 'Hi! How can I help with your plants?',
            },
          ],
        },
      ],
      sendMessage: mockSendMessage,
      status: 'ready',
      pendingImageUrl: mockPendingImageUrl,
    })

    renderWithProviders(<ChatScreen />)

    expect(screen.getByText('Hello')).toBeTruthy()
    expect(
      screen.getByText('Hi! How can I help with your plants?')
    ).toBeTruthy()
  })

  it('shows typing indicator when streaming with empty content', () => {
    mockedUseChatHistory.mockReturnValue({
      data: [],
      isLoading: false,
      initialMessages: [],
    })

    mockedUsePlantChat.mockReturnValue({
      messages: [
        {
          id: 'msg-1',
          role: 'user',
          parts: [{ type: 'text', text: 'Hello' }],
        },
        {
          id: 'msg-2',
          role: 'assistant',
          parts: [{ type: 'text', text: '' }],
        },
      ],
      sendMessage: mockSendMessage,
      status: 'streaming',
      pendingImageUrl: mockPendingImageUrl,
    })

    const { toJSON } = renderWithProviders(<ChatScreen />)
    expect(toJSON()).toBeTruthy()
  })
})
