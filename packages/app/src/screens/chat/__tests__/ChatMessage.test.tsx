import { render, screen } from '@testing-library/react-native'
import type { UIMessage } from 'ai'

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: jest.fn(() => ({
    state: {
      _tag: 'Authenticated',
      user: { id: 'user-1', email: 'test@example.com' },
    },
  })),
}))

import { ChatMessage } from '../components/ChatMessage'

describe('ChatMessage', () => {
  it('renders user message content', () => {
    const message: UIMessage = {
      id: 'msg-1',
      role: 'user',
      parts: [{ type: 'text', text: 'How do I water my monstera?' }],
    }

    render(<ChatMessage message={message} />)

    expect(screen.getByText('How do I water my monstera?')).toBeTruthy()
  })

  it('renders assistant message content', () => {
    const message: UIMessage = {
      id: 'msg-2',
      role: 'assistant',
      parts: [
        {
          type: 'text',
          text: 'Water your monstera when the top inch of soil is dry.',
        },
      ],
    }

    render(<ChatMessage message={message} />)

    expect(
      screen.getByText('Water your monstera when the top inch of soil is dry.')
    ).toBeTruthy()
  })

  it('renders with image', () => {
    const message: UIMessage = {
      id: 'msg-1',
      role: 'user',
      parts: [
        { type: 'text', text: 'What plant is this?' },
        {
          type: 'file',
          mediaType: 'image/jpeg',
          url: 'https://example.com/plant.jpg',
        },
      ],
    }

    const { toJSON } = render(<ChatMessage message={message} />)
    expect(toJSON()).toBeTruthy()
  })
})
