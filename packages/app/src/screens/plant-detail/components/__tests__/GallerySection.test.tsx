import { fireEvent, render, screen } from '@testing-library/react-native'
import { mockNow } from 'src/__tests__/utils/dates'
import { GallerySection } from '../GallerySection'

describe('GallerySection', () => {
  const mockOnPhotoPress = jest.fn()
  const mockOnAddPhoto = jest.fn()
  const mockOnSeeAll = jest.fn()

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

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders gallery section', () => {
    render(
      <GallerySection
        photos={mockPhotos}
        onPhotoPress={mockOnPhotoPress}
        onAddPhoto={mockOnAddPhoto}
        onSeeAll={mockOnSeeAll}
      />
    )

    expect(screen.getByTestId('gallery-section')).toBeTruthy()
  })

  it('displays section header', () => {
    render(
      <GallerySection
        photos={mockPhotos}
        onPhotoPress={mockOnPhotoPress}
        onAddPhoto={mockOnAddPhoto}
        onSeeAll={mockOnSeeAll}
      />
    )

    expect(screen.getByText('Gallery')).toBeTruthy()
  })

  it('shows see all link when photos exist', () => {
    render(
      <GallerySection
        photos={mockPhotos}
        onPhotoPress={mockOnPhotoPress}
        onAddPhoto={mockOnAddPhoto}
        onSeeAll={mockOnSeeAll}
      />
    )

    expect(screen.getByText('See All')).toBeTruthy()
  })

  it('hides see all when no photos', () => {
    render(
      <GallerySection
        photos={[]}
        onPhotoPress={mockOnPhotoPress}
        onAddPhoto={mockOnAddPhoto}
        onSeeAll={mockOnSeeAll}
      />
    )

    expect(screen.queryByText('See All')).toBeNull()
  })

  it('renders add photo button', () => {
    render(
      <GallerySection
        photos={[]}
        onPhotoPress={mockOnPhotoPress}
        onAddPhoto={mockOnAddPhoto}
        onSeeAll={mockOnSeeAll}
      />
    )

    expect(screen.getByTestId('add-photo-button')).toBeTruthy()
  })

  it('calls onAddPhoto when add button pressed', () => {
    render(
      <GallerySection
        photos={[]}
        onPhotoPress={mockOnPhotoPress}
        onAddPhoto={mockOnAddPhoto}
        onSeeAll={mockOnSeeAll}
      />
    )

    fireEvent.press(screen.getByTestId('add-photo-button'))

    expect(mockOnAddPhoto).toHaveBeenCalledTimes(1)
  })

  it('calls onPhotoPress when photo is pressed', () => {
    render(
      <GallerySection
        photos={mockPhotos}
        onPhotoPress={mockOnPhotoPress}
        onAddPhoto={mockOnAddPhoto}
        onSeeAll={mockOnSeeAll}
      />
    )

    fireEvent.press(screen.getByTestId('photo-photo-1'))

    expect(mockOnPhotoPress).toHaveBeenCalledWith('photo-1')
  })

  it('calls onSeeAll when see all is pressed', () => {
    render(
      <GallerySection
        photos={mockPhotos}
        onPhotoPress={mockOnPhotoPress}
        onAddPhoto={mockOnAddPhoto}
        onSeeAll={mockOnSeeAll}
      />
    )

    fireEvent.press(screen.getByText('See All'))

    expect(mockOnSeeAll).toHaveBeenCalledTimes(1)
  })
})
