import { fireEvent, render, screen } from '@testing-library/react-native'
import { mockNow } from 'src/__tests__/utils/dates'
import { GallerySection } from '../components/GallerySection'

describe('GallerySection', () => {
  const mockPhotos = [
    {
      id: 'photo-1',
      url: 'https://example.com/photo1.jpg',
      createdAt: mockNow(),
    },
    {
      id: 'photo-2',
      url: 'https://example.com/photo2.jpg',
      createdAt: mockNow(),
    },
  ]

  const defaultProps = {
    photos: mockPhotos,
    onPhotoPress: jest.fn(),
    onPhoto: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders gallery section', () => {
    render(<GallerySection {...defaultProps} />)
    expect(screen.getByTestId('gallery-section')).toBeTruthy()
  })

  it('renders add photo button', () => {
    render(<GallerySection {...defaultProps} />)
    expect(screen.getByTestId('add-photo-button')).toBeTruthy()
  })

  it('renders photo thumbnails', () => {
    render(<GallerySection {...defaultProps} />)
    expect(screen.getByTestId('photo-photo-1')).toBeTruthy()
    expect(screen.getByTestId('photo-photo-2')).toBeTruthy()
  })

  it('calls onPhotoPress when photo tapped', () => {
    const onPhotoPress = jest.fn()
    render(<GallerySection {...defaultProps} onPhotoPress={onPhotoPress} />)

    fireEvent.press(screen.getByTestId('photo-photo-1'))
    expect(onPhotoPress).toHaveBeenCalledWith('photo-1')
  })

  it('opens picker sheet when add button pressed', () => {
    render(<GallerySection {...defaultProps} />)

    fireEvent.press(screen.getByTestId('add-photo-button'))

    expect(screen.getByText('Add Photo')).toBeTruthy()
    expect(screen.getByText('Choose from gallery')).toBeTruthy()
    expect(screen.getByText('Take a photo')).toBeTruthy()
  })

  it('shows header with gallery text', () => {
    render(<GallerySection {...defaultProps} />)
    expect(screen.getByText('Gallery')).toBeTruthy()
  })

  it('renders empty state when no photos', () => {
    render(<GallerySection {...defaultProps} photos={[]} />)
    expect(screen.getByTestId('add-photo-button')).toBeTruthy()
    expect(screen.queryByTestId('photo-photo-1')).toBeNull()
  })
})
