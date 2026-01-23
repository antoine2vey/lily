import { fireEvent, render, screen } from '@testing-library/react-native'
import { ThemeSelectionModal } from '../ThemeSelectionModal'

describe('ThemeSelectionModal', () => {
  const mockOnClose = jest.fn()
  const mockOnSelect = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders theme options', () => {
    render(
      <ThemeSelectionModal
        visible={true}
        onClose={mockOnClose}
        currentTheme="light"
        onSelect={mockOnSelect}
      />
    )

    expect(screen.getByText('Light')).toBeTruthy()
    expect(screen.getByText('Dark')).toBeTruthy()
    expect(screen.getByText('System')).toBeTruthy()
  })

  it('calls onSelect when theme option is pressed', () => {
    render(
      <ThemeSelectionModal
        visible={true}
        onClose={mockOnClose}
        currentTheme="light"
        onSelect={mockOnSelect}
      />
    )

    fireEvent.press(screen.getByText('Dark'))

    expect(mockOnSelect).toHaveBeenCalledWith('dark')
  })

  it('calls onClose when Done button is pressed', () => {
    render(
      <ThemeSelectionModal
        visible={true}
        onClose={mockOnClose}
        currentTheme="light"
        onSelect={mockOnSelect}
      />
    )

    fireEvent.press(screen.getByText('Done'))

    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it('closes modal after selecting a theme', () => {
    render(
      <ThemeSelectionModal
        visible={true}
        onClose={mockOnClose}
        currentTheme="light"
        onSelect={mockOnSelect}
      />
    )

    fireEvent.press(screen.getByText('System'))

    expect(mockOnClose).toHaveBeenCalled()
  })
})
