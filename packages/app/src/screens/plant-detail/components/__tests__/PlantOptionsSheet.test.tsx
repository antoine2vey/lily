import { fireEvent, render, screen } from '@testing-library/react-native'
import { plantActionsFor } from '@/utils/canopy-plants'
import { PlantOptionsSheet } from '../PlantOptionsSheet'

describe('PlantOptionsSheet', () => {
  const mockOnClose = jest.fn()
  const mockOnEdit = jest.fn()
  const mockOnToggleFavorite = jest.fn()
  const mockOnShare = jest.fn()
  const mockOnDelete = jest.fn()
  const mockOnSayGoodbye = jest.fn()
  const mockOnBringBack = jest.fn()
  const mockOnShareToCanopy = jest.fn()
  const mockOnUnshare = jest.fn()
  const mockOnToggleMute = jest.fn()

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
    canopyName: 'Home',
    actions: plantActionsFor('owner', false),
    muted: false,
    canEndLife: true,
    onShareToCanopy: mockOnShareToCanopy,
    onUnshare: mockOnUnshare,
    onToggleMute: mockOnToggleMute,
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

  describe('Canopy rows', () => {
    it('shows none of them on a personal plant outside a Canopy', () => {
      render(<PlantOptionsSheet {...defaultProps} />)

      expect(screen.queryByTestId('option-share-canopy')).toBeNull()
      expect(screen.queryByTestId('option-unshare')).toBeNull()
      expect(screen.queryByTestId('option-mute')).toBeNull()
    })

    it('offers the owner of a personal plant to share it with the Canopy', () => {
      render(
        <PlantOptionsSheet
          {...defaultProps}
          actions={plantActionsFor('owner', true)}
        />
      )

      fireEvent.press(screen.getByText('Share with Home'))

      expect(mockOnShareToCanopy).toHaveBeenCalled()
      expect(screen.queryByTestId('option-unshare')).toBeNull()
      expect(screen.queryByTestId('option-mute')).toBeNull()
    })

    it('lets the member who added a Canopy plant unshare, mute and delete it', () => {
      render(
        <PlantOptionsSheet
          {...defaultProps}
          isDead
          actions={plantActionsFor('canopyCreator', true)}
        />
      )

      expect(screen.getByTestId('option-unshare')).toBeTruthy()
      expect(screen.getByTestId('option-mute')).toBeTruthy()
      expect(screen.getByTestId('option-delete')).toBeTruthy()
      expect(screen.queryByTestId('option-share-canopy')).toBeNull()
    })

    it('lets another member mute a Canopy plant but not unshare or delete it', () => {
      render(
        <PlantOptionsSheet
          {...defaultProps}
          isDead
          actions={plantActionsFor('canopyMember', true)}
        />
      )

      expect(screen.getByTestId('option-mute')).toBeTruthy()
      expect(screen.queryByTestId('option-unshare')).toBeNull()
      expect(screen.queryByTestId('option-delete')).toBeNull()
      expect(screen.getByText('Bring back')).toBeTruthy()
    })

    it('labels the mute row by the current state', () => {
      render(
        <PlantOptionsSheet
          {...defaultProps}
          muted
          actions={plantActionsFor('canopyMember', true)}
        />
      )

      fireEvent.press(screen.getByTestId('option-mute'))

      expect(screen.getByText('Unmute reminders')).toBeTruthy()
      expect(mockOnToggleMute).toHaveBeenCalled()
    })

    it('hides goodbye and bring back from a caretaker', () => {
      render(
        <PlantOptionsSheet
          {...defaultProps}
          actions={plantActionsFor('caretaker', false)}
          canEndLife={false}
        />
      )

      expect(screen.queryByText('Say goodbye')).toBeNull()
      expect(screen.queryByText('Bring back')).toBeNull()
    })
  })
})
