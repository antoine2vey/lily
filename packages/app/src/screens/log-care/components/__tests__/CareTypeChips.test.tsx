import { fireEvent, render, screen } from '@testing-library/react-native'
import { CareTypeChips } from '../CareTypeChips'

describe('CareTypeChips', () => {
  const mockOnValueChange = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders care type label', () => {
    render(<CareTypeChips value="water" onValueChange={mockOnValueChange} />)

    expect(screen.getByText('Care Type')).toBeTruthy()
  })

  it('renders custom label', () => {
    render(
      <CareTypeChips
        value="water"
        onValueChange={mockOnValueChange}
        label="Select Action"
      />
    )

    expect(screen.getByText('Select Action')).toBeTruthy()
  })

  it('renders water chip', () => {
    render(<CareTypeChips value="water" onValueChange={mockOnValueChange} />)

    expect(screen.getByText('Water')).toBeTruthy()
  })

  it('renders fertilize chip', () => {
    render(<CareTypeChips value="water" onValueChange={mockOnValueChange} />)

    expect(screen.getByText('Fertilize')).toBeTruthy()
  })

  it('calls onValueChange when chip is pressed', () => {
    render(<CareTypeChips value="water" onValueChange={mockOnValueChange} />)

    fireEvent.press(screen.getByText('Fertilize'))

    expect(mockOnValueChange).toHaveBeenCalledWith('fertilize')
  })

  it('calls onValueChange with water when water chip is pressed', () => {
    render(
      <CareTypeChips value="fertilize" onValueChange={mockOnValueChange} />
    )

    fireEvent.press(screen.getByText('Water'))

    expect(mockOnValueChange).toHaveBeenCalledWith('water')
  })
})
