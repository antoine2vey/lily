import { render, screen } from '@testing-library/react-native'

// Mock dependencies
jest.mock('@react-navigation/native', () => ({
  useRoute: jest.fn(() => ({ params: {} })),
}))

jest.mock('@/hooks/useChatHistory', () => ({
  useChatHistory: jest.fn(),
}))

jest.mock('@/hooks/useSendMessage', () => ({
  useSendMessage: jest.fn(),
}))

import { useChatHistory } from '@/hooks/useChatHistory'
import { useSendMessage } from '@/hooks/useSendMessage'
import { ChatScreen } from '../ChatScreen'

const mockedUseChatHistory = useChatHistory as jest.MockedFunction<
  typeof useChatHistory
>
const mockedUseSendMessage = useSendMessage as jest.MockedFunction<
  typeof useSendMessage
>

describe('ChatScreen', () => {
  const mockSendMessage = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    mockedUseSendMessage.mockReturnValue({
      mutate: mockSendMessage,
      isPending: false,
    } as any)
  })

  it('renders loading state', () => {
    mockedUseChatHistory.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as any)

    const { toJSON } = render(<ChatScreen />)
    expect(toJSON()).toBeTruthy()
  })

  it('displays chat input', () => {
    mockedUseChatHistory.mockReturnValue({
      data: [],
      isLoading: false,
    } as any)

    render(<ChatScreen />)

    expect(screen.getByPlaceholderText('Ask about plant care...')).toBeTruthy()
  })

  it('displays messages when available', () => {
    mockedUseChatHistory.mockReturnValue({
      data: [
        {
          id: 'msg-1',
          role: 'user',
          content: 'Hello',
          createdAt: new Date().toISOString(),
        },
        {
          id: 'msg-2',
          role: 'assistant',
          content: 'Hi! How can I help with your plants?',
          createdAt: new Date().toISOString(),
        },
      ],
      isLoading: false,
    } as any)

    render(<ChatScreen />)

    expect(screen.getByText('Hello')).toBeTruthy()
    expect(
      screen.getByText('Hi! How can I help with your plants?')
    ).toBeTruthy()
  })

  it('shows typing indicator when sending', () => {
    mockedUseChatHistory.mockReturnValue({
      data: [],
      isLoading: false,
    } as any)
    mockedUseSendMessage.mockReturnValue({
      mutate: mockSendMessage,
      isPending: true,
    } as any)

    const { toJSON } = render(<ChatScreen />)
    expect(toJSON()).toBeTruthy()
  })
})
