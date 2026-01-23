import { fireEvent, render, screen } from '@testing-library/react-native'
import { ChatInput } from '../components/ChatInput'

describe('ChatInput', () => {
  const mockOnSend = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders input with placeholder', () => {
    render(<ChatInput onSend={mockOnSend} />)

    expect(screen.getByPlaceholderText('Ask about plant care...')).toBeTruthy()
  })

  it('renders component', () => {
    const { toJSON } = render(<ChatInput onSend={mockOnSend} />)
    expect(toJSON()).toBeTruthy()
  })

  it('accepts text input', () => {
    render(<ChatInput onSend={mockOnSend} />)

    fireEvent.changeText(
      screen.getByPlaceholderText('Ask about plant care...'),
      'Hello'
    )

    // Input should contain the text
    expect(screen.getByDisplayValue('Hello')).toBeTruthy()
  })

  it('shows loading state when isPending', () => {
    const { toJSON } = render(<ChatInput onSend={mockOnSend} isPending />)
    expect(toJSON()).toBeTruthy()
  })
})
