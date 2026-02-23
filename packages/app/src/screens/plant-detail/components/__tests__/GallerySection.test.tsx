import { fireEvent, render, screen } from '@testing-library/react-native'
import { mockNow } from 'src/__tests__/utils/dates'
import { GallerySection } from '../GallerySection'

describe('GallerySection', () => {
  const mockOnPhotoPress = jest.fn()
  const mockOnPhoto = jest.fn()

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
        onPhoto={mockOnPhoto}
      />
    )

    expect(screen.getByTestId('gallery-section')).toBeTruthy()
  })

  it('displays section header', () => {
    render(
      <GallerySection
        photos={mockPhotos}
        onPhotoPress={mockOnPhotoPress}
        onPhoto={mockOnPhoto}
      />
    )

    expect(screen.getByText('Gallery')).toBeTruthy()
  })

  it('renders add photo button', () => {
    render(
      <GallerySection
        photos={[]}
        onPhotoPress={mockOnPhotoPress}
        onPhoto={mockOnPhoto}
      />
    )

    expect(screen.getByTestId('add-photo-button')).toBeTruthy()
  })

  it('opens picker sheet when add button pressed', () => {
    render(
      <GallerySection
        photos={[]}
        onPhotoPress={mockOnPhotoPress}
        onPhoto={mockOnPhoto}
      />
    )

    fireEvent.press(screen.getByTestId('add-photo-button'))

    expect(screen.getByText('Add Photo')).toBeTruthy()
    expect(screen.getByText('Choose from gallery')).toBeTruthy()
    expect(screen.getByText('Take a photo')).toBeTruthy()
  })

  it('calls onPhotoPress when photo is pressed', () => {
    render(
      <GallerySection
        photos={mockPhotos}
        onPhotoPress={mockOnPhotoPress}
        onPhoto={mockOnPhoto}
      />
    )

    fireEvent.press(screen.getByTestId('photo-photo-1'))

    expect(mockOnPhotoPress).toHaveBeenCalledWith('photo-1')
  })

  it('renders empty state when no photos', () => {
    render(
      <GallerySection
        photos={[]}
        onPhotoPress={mockOnPhotoPress}
        onPhoto={mockOnPhoto}
      />
    )

    expect(screen.getByTestId('add-photo-button')).toBeTruthy()
    expect(screen.queryByTestId('photo-photo-1')).toBeNull()
  })
})
