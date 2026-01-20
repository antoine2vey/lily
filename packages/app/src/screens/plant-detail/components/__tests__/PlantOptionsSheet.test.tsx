import { fireEvent, render, screen } from '@testing-library/react-native'
import { PlantOptionsSheet } from '../PlantOptionsSheet'

describe('PlantOptionsSheet', () => {
  const defaultProps = {
    visible: true,
    onClose: jest.fn(),
    plantName: 'Monstera Deliciosa',
    isFavorite: false,
    onEdit: jest.fn(),
    onToggleFavorite: jest.fn(),
    onExportHistory: jest.fn(),
    onShare: jest.fn(),
    onDelete: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders plant name in header', () => {
    render(<PlantOptionsSheet {...defaultProps} />)
    expect(screen.getByText('Monstera Deliciosa')).toBeTruthy()
  })

  it('renders all 5 options', () => {
    render(<PlantOptionsSheet {...defaultProps} />)
    expect(screen.getByText('Edit Plant Details')).toBeTruthy()
    expect(screen.getByText('Set as Favorite')).toBeTruthy()
    expect(screen.getByText('Export Care History')).toBeTruthy()
    expect(screen.getByText('Share Plant Profile')).toBeTruthy()
    expect(screen.getByText('Delete Plant')).toBeTruthy()
  })

  it('shows Remove from Favorites when favorited', () => {
    render(<PlantOptionsSheet {...defaultProps} isFavorite={true} />)
    expect(screen.getByText('Remove from Favorites')).toBeTruthy()
  })

  it('shows Set as Favorite when not favorited', () => {
    render(<PlantOptionsSheet {...defaultProps} isFavorite={false} />)
    expect(screen.getByText('Set as Favorite')).toBeTruthy()
  })

  it('calls onEdit when Edit pressed', () => {
    render(<PlantOptionsSheet {...defaultProps} />)
    fireEvent.press(screen.getByText('Edit Plant Details'))
    expect(defaultProps.onClose).toHaveBeenCalled()
    expect(defaultProps.onEdit).toHaveBeenCalled()
  })

  it('calls onToggleFavorite when favorite pressed', () => {
    render(<PlantOptionsSheet {...defaultProps} />)
    fireEvent.press(screen.getByText('Set as Favorite'))
    expect(defaultProps.onClose).toHaveBeenCalled()
    expect(defaultProps.onToggleFavorite).toHaveBeenCalled()
  })

  it('calls onExportHistory when export pressed', () => {
    render(<PlantOptionsSheet {...defaultProps} />)
    fireEvent.press(screen.getByText('Export Care History'))
    expect(defaultProps.onClose).toHaveBeenCalled()
    expect(defaultProps.onExportHistory).toHaveBeenCalled()
  })

  it('calls onShare when share pressed', () => {
    render(<PlantOptionsSheet {...defaultProps} />)
    fireEvent.press(screen.getByText('Share Plant Profile'))
    expect(defaultProps.onClose).toHaveBeenCalled()
    expect(defaultProps.onShare).toHaveBeenCalled()
  })

  it('calls onDelete when delete pressed', () => {
    render(<PlantOptionsSheet {...defaultProps} />)
    fireEvent.press(screen.getByText('Delete Plant'))
    expect(defaultProps.onClose).toHaveBeenCalled()
    expect(defaultProps.onDelete).toHaveBeenCalled()
  })

  it('returns null when not visible', () => {
    const { toJSON } = render(
      <PlantOptionsSheet {...defaultProps} visible={false} />
    )
    expect(toJSON()).toBeNull()
  })
})
