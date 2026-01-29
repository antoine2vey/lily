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
    onAddPhoto: jest.fn(),
    onSeeAll: jest.fn(),
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

  it('calls onAddPhoto when add button pressed', () => {
    const onAddPhoto = jest.fn()
    render(<GallerySection {...defaultProps} onAddPhoto={onAddPhoto} />)

    fireEvent.press(screen.getByTestId('add-photo-button'))
    expect(onAddPhoto).toHaveBeenCalledTimes(1)
  })

  it('shows See All button only when photos exist', () => {
    render(<GallerySection {...defaultProps} />)
    expect(screen.getByText('See All')).toBeTruthy()
  })

  it('hides See All button when no photos', () => {
    render(<GallerySection {...defaultProps} photos={[]} />)
    expect(screen.queryByText('See All')).toBeNull()
  })

  it('calls onSeeAll when See All pressed', () => {
    const onSeeAll = jest.fn()
    render(<GallerySection {...defaultProps} onSeeAll={onSeeAll} />)

    fireEvent.press(screen.getByText('See All'))
    expect(onSeeAll).toHaveBeenCalledTimes(1)
  })

  it('renders empty state when no photos', () => {
    render(<GallerySection {...defaultProps} photos={[]} />)
    // Should still render the add photo button
    expect(screen.getByTestId('add-photo-button')).toBeTruthy()
    // But no photo thumbnails
    expect(screen.queryByTestId('photo-photo-1')).toBeNull()
  })
})
