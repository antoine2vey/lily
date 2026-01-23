import { fireEvent, render, screen } from '@testing-library/react-native'
import { BioInput } from '../BioInput'

describe('BioInput', () => {
  const mockOnChangeText = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders bio label', () => {
    render(<BioInput value="" onChangeText={mockOnChangeText} />)

    expect(screen.getByText('Bio')).toBeTruthy()
  })

  it('displays character count', () => {
    render(<BioInput value="Hello world" onChangeText={mockOnChangeText} />)

    expect(screen.getByText('11/150')).toBeTruthy()
  })

  it('displays custom max length', () => {
    render(
      <BioInput value="Hello" onChangeText={mockOnChangeText} maxLength={100} />
    )

    expect(screen.getByText('5/100')).toBeTruthy()
  })

  it('calls onChangeText when text changes', () => {
    render(<BioInput value="" onChangeText={mockOnChangeText} />)

    const input = screen.getByPlaceholderText(/Tell us about yourself/i)
    fireEvent.changeText(input, 'New bio text')

    expect(mockOnChangeText).toHaveBeenCalledWith('New bio text')
  })

  it('shows placeholder text', () => {
    render(<BioInput value="" onChangeText={mockOnChangeText} />)

    expect(screen.getByPlaceholderText(/Tell us about yourself/i)).toBeTruthy()
  })

  it('displays current value', () => {
    render(<BioInput value="My existing bio" onChangeText={mockOnChangeText} />)

    expect(screen.getByDisplayValue('My existing bio')).toBeTruthy()
  })
})
