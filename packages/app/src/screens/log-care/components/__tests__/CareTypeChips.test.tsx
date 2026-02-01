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

  it('renders watering option', () => {
    render(<CareTypeChips value="water" onValueChange={mockOnValueChange} />)

    expect(screen.getByText('Watering')).toBeTruthy()
  })

  it('renders fertilization option', () => {
    render(<CareTypeChips value="water" onValueChange={mockOnValueChange} />)

    expect(screen.getByText('Fertilization')).toBeTruthy()
  })

  it('calls onValueChange when fertilization is pressed', () => {
    render(<CareTypeChips value="water" onValueChange={mockOnValueChange} />)

    fireEvent.press(screen.getByText('Fertilization'))

    expect(mockOnValueChange).toHaveBeenCalledWith('fertilize')
  })

  it('calls onValueChange with water when watering is pressed', () => {
    render(
      <CareTypeChips value="fertilize" onValueChange={mockOnValueChange} />
    )

    fireEvent.press(screen.getByText('Watering'))

    expect(mockOnValueChange).toHaveBeenCalledWith('water')
  })
})
