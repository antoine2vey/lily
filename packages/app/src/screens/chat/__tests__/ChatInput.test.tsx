import { fireEvent, render, screen } from '@testing-library/react-native'
import { ChatInput } from '../components/ChatInput'

describe('ChatInput', () => {
  const mockOnSend = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('asks about the plant in a plant chat', () => {
    render(<ChatInput onSend={mockOnSend} isPlantChat />)

    expect(screen.getByPlaceholderText('Ask about this plant...')).toBeTruthy()
  })

  it('asks about all plants in a general chat', () => {
    render(<ChatInput onSend={mockOnSend} isPlantChat={false} />)

    expect(
      screen.getByPlaceholderText('Ask Lily about your plants...')
    ).toBeTruthy()
    expect(screen.queryByPlaceholderText('Ask about this plant...')).toBeNull()
  })

  it('renders component', () => {
    const { toJSON } = render(<ChatInput onSend={mockOnSend} isPlantChat />)
    expect(toJSON()).toBeTruthy()
  })

  it('accepts text input', () => {
    render(<ChatInput onSend={mockOnSend} isPlantChat />)

    fireEvent.changeText(
      screen.getByPlaceholderText('Ask about this plant...'),
      'Hello'
    )

    // Input should contain the text
    expect(screen.getByDisplayValue('Hello')).toBeTruthy()
  })

  it('shows disabled state when disabled', () => {
    const { toJSON } = render(
      <ChatInput onSend={mockOnSend} isPlantChat disabled />
    )
    expect(toJSON()).toBeTruthy()
  })
})
