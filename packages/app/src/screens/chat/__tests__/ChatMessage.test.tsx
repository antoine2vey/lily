import { render, screen } from '@testing-library/react-native'
import { mockIsoString } from 'src/__tests__/utils/dates'
import { ChatMessage } from '../components/ChatMessage'

describe('ChatMessage', () => {
  it('renders user message content', () => {
    const message = {
      id: 'msg-1',
      role: 'user' as const,
      content: 'How do I water my monstera?',
      createdAt: mockIsoString(),
    }

    render(<ChatMessage message={message} />)

    expect(screen.getByText('How do I water my monstera?')).toBeTruthy()
  })

  it('renders assistant message content', () => {
    const message = {
      id: 'msg-2',
      role: 'assistant' as const,
      content: 'Water your monstera when the top inch of soil is dry.',
      createdAt: mockIsoString(),
    }

    render(<ChatMessage message={message} />)

    expect(
      screen.getByText('Water your monstera when the top inch of soil is dry.')
    ).toBeTruthy()
  })

  it('renders with image', () => {
    const message = {
      id: 'msg-1',
      role: 'user' as const,
      content: 'What plant is this?',
      imageUrl: 'https://example.com/plant.jpg',
      createdAt: mockIsoString(),
    }

    const { toJSON } = render(<ChatMessage message={message} />)
    expect(toJSON()).toBeTruthy()
  })
})
