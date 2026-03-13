import { fireEvent, render, screen } from '@testing-library/react-native'
import { CareTypeChips } from '../CareTypeChips'

describe('CareTypeChips', () => {
  const mockOnValueChange = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders care type label', () => {
    render(<CareTypeChips value="watering" onValueChange={mockOnValueChange} />)

    expect(screen.getByText('Care Type')).toBeTruthy()
  })

  it('renders custom label', () => {
    render(
      <CareTypeChips
        value="watering"
        onValueChange={mockOnValueChange}
        label="Select Action"
      />
    )

    expect(screen.getByText('Select Action')).toBeTruthy()
  })

  it('renders watering option', () => {
    render(<CareTypeChips value="watering" onValueChange={mockOnValueChange} />)

    expect(screen.getByText('Watering')).toBeTruthy()
  })

  it('renders fertilization option', () => {
    render(<CareTypeChips value="watering" onValueChange={mockOnValueChange} />)

    expect(screen.getByText('Fertilization')).toBeTruthy()
  })

  it('calls onValueChange when fertilization is pressed', () => {
    render(<CareTypeChips value="watering" onValueChange={mockOnValueChange} />)

    fireEvent.press(screen.getByText('Fertilization'))

    expect(mockOnValueChange).toHaveBeenCalledWith('fertilization')
  })

  it('calls onValueChange with watering when watering is pressed', () => {
    render(
      <CareTypeChips value="fertilization" onValueChange={mockOnValueChange} />
    )

    fireEvent.press(screen.getByText('Watering'))

    expect(mockOnValueChange).toHaveBeenCalledWith('watering')
  })
})
