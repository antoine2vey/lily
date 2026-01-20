import { fireEvent, render, screen } from '@testing-library/react-native'
import { GallerySection } from '../GallerySection'

describe('GallerySection', () => {
  const mockPhotos = [
    {
      id: 'photo-1',
      url: 'https://example.com/photo1.jpg',
      createdAt: new Date(),
    },
    {
      id: 'photo-2',
      url: 'https://example.com/photo2.jpg',
      createdAt: new Date(),
    },
  ]

  const defaultProps = {
    photos: mockPhotos,
    onPhotoPress: jest.fn(),
    onAddPhoto: jest.fn(),
    onSeeAll: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders section header', () => {
    render(<GallerySection {...defaultProps} />)
    expect(screen.getByText('Gallery')).toBeTruthy()
  })

  it('renders add photo button first', () => {
    render(<GallerySection {...defaultProps} />)
    expect(screen.getByTestId('add-photo-button')).toBeTruthy()
  })

  it('renders photo thumbnails', () => {
    render(<GallerySection {...defaultProps} />)
    expect(screen.getByTestId('photo-photo-1')).toBeTruthy()
    expect(screen.getByTestId('photo-photo-2')).toBeTruthy()
  })

  it('calls onPhotoPress when photo tapped', () => {
    render(<GallerySection {...defaultProps} />)
    fireEvent.press(screen.getByTestId('photo-photo-1'))
    expect(defaultProps.onPhotoPress).toHaveBeenCalledWith('photo-1')
  })

  it('calls onAddPhoto when add button pressed', () => {
    render(<GallerySection {...defaultProps} />)
    fireEvent.press(screen.getByTestId('add-photo-button'))
    expect(defaultProps.onAddPhoto).toHaveBeenCalledTimes(1)
  })

  it('calls onSeeAll when header action pressed', () => {
    render(<GallerySection {...defaultProps} />)
    fireEvent.press(screen.getByText('See All'))
    expect(defaultProps.onSeeAll).toHaveBeenCalledTimes(1)
  })

  it('does not show See All when no photos', () => {
    render(<GallerySection {...defaultProps} photos={[]} />)
    expect(screen.queryByText('See All')).toBeNull()
  })
})
