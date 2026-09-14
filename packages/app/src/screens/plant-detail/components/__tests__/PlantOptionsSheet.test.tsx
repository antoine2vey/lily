import { fireEvent, render, screen } from '@testing-library/react-native'
import { PlantOptionsSheet } from '../PlantOptionsSheet'

describe('PlantOptionsSheet', () => {
  const mockOnClose = jest.fn()
  const mockOnEdit = jest.fn()
  const mockOnToggleFavorite = jest.fn()
  const mockOnShare = jest.fn()
  const mockOnDelete = jest.fn()
  const mockOnSayGoodbye = jest.fn()
  const mockOnBringBack = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  const defaultProps = {
    visible: true,
    onClose: mockOnClose,
    plantName: 'Monstera',
    isFavorite: false,
    onEdit: mockOnEdit,
    onToggleFavorite: mockOnToggleFavorite,
    onShare: mockOnShare,
    onSayGoodbye: mockOnSayGoodbye,
    onBringBack: mockOnBringBack,
    onDelete: mockOnDelete,
    isDead: false,
  }

  it('displays plant name', () => {
    render(<PlantOptionsSheet {...defaultProps} />)

    expect(screen.getByTestId('plant-options-name')).toHaveTextContent(
      'Monstera'
    )
  })

  it('displays edit option', () => {
    render(<PlantOptionsSheet {...defaultProps} />)

    expect(screen.getByText('Edit Plant Details')).toBeTruthy()
  })

  it('displays set as favorite when not favorite', () => {
    render(<PlantOptionsSheet {...defaultProps} isFavorite={false} />)

    expect(screen.getByText('Set as Favorite')).toBeTruthy()
  })

  it('displays remove from favorites when is favorite', () => {
    render(<PlantOptionsSheet {...defaultProps} isFavorite={true} />)

    expect(screen.getByText('Remove from Favorites')).toBeTruthy()
  })

  it('displays share option', () => {
    render(<PlantOptionsSheet {...defaultProps} />)

    expect(screen.getByText('Share Plant Profile')).toBeTruthy()
  })

  it('offers say goodbye, not delete, for a living plant', () => {
    render(<PlantOptionsSheet {...defaultProps} />)

    expect(screen.getByText('Say goodbye')).toBeTruthy()
    expect(screen.queryByText('Delete permanently')).toBeNull()
  })

  it('offers bring back and delete for a dead plant', () => {
    render(<PlantOptionsSheet {...defaultProps} isDead />)

    expect(screen.getByText('Bring back')).toBeTruthy()
    expect(screen.getByText('Delete permanently')).toBeTruthy()
    expect(screen.queryByText('Say goodbye')).toBeNull()
  })

  it('calls onSayGoodbye and onClose when say goodbye is pressed', () => {
    render(<PlantOptionsSheet {...defaultProps} />)

    fireEvent.press(screen.getByText('Say goodbye'))

    expect(mockOnSayGoodbye).toHaveBeenCalled()
    expect(mockOnClose).toHaveBeenCalled()
  })

  it('calls onBringBack and onClose when bring back is pressed', () => {
    render(<PlantOptionsSheet {...defaultProps} isDead />)

    fireEvent.press(screen.getByText('Bring back'))

    expect(mockOnBringBack).toHaveBeenCalled()
    expect(mockOnClose).toHaveBeenCalled()
  })

  it('calls onEdit and onClose when edit is pressed', () => {
    render(<PlantOptionsSheet {...defaultProps} />)

    fireEvent.press(screen.getByText('Edit Plant Details'))

    expect(mockOnClose).toHaveBeenCalled()
    expect(mockOnEdit).toHaveBeenCalled()
  })

  it('calls onToggleFavorite and onClose when toggle favorite is pressed', () => {
    render(<PlantOptionsSheet {...defaultProps} />)

    fireEvent.press(screen.getByText('Set as Favorite'))

    expect(mockOnClose).toHaveBeenCalled()
    expect(mockOnToggleFavorite).toHaveBeenCalled()
  })

  it('calls onDelete and onClose when delete is pressed', () => {
    render(<PlantOptionsSheet {...defaultProps} isDead />)

    fireEvent.press(screen.getByText('Delete permanently'))

    expect(mockOnDelete).toHaveBeenCalled()
    expect(mockOnClose).toHaveBeenCalled()
  })
})
