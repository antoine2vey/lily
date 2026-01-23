import { fireEvent, render, screen } from '@testing-library/react-native'
import {
  mockRouter,
  resetNavigationMocks,
  setMockSearchParams,
} from 'src/__tests__/mocks/navigation'
import { GalleryScreen } from '../GalleryScreen'

// Mock the hooks
const mockUsePhotos = jest.fn()
const mockUploadPhotoMutate = jest.fn()
const mockUseUploadPhoto = jest.fn()

jest.mock('src/hooks/usePhotos', () => ({
  usePhotos: (...args: unknown[]) => mockUsePhotos(...args),
}))

jest.mock('src/hooks/useUploadPhoto', () => ({
  useUploadPhoto: () => mockUseUploadPhoto(),
}))

// Mock expo-image-picker
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn().mockResolvedValue({
    canceled: true,
    assets: [],
  }),
}))

describe('GalleryScreen', () => {
  const mockPhotosData = {
    items: [
      {
        id: 'photo-1',
        url: 'https://example.com/photo1.jpg',
        takenAt: new Date(),
        plantId: 'plant-1',
      },
      {
        id: 'photo-2',
        url: 'https://example.com/photo2.jpg',
        takenAt: new Date(),
        plantId: 'plant-1',
      },
    ],
    total: 2,
    hasMore: false,
  }

  beforeEach(() => {
    jest.clearAllMocks()
    resetNavigationMocks()
    setMockSearchParams({ plantId: 'plant-1' })
    mockUseUploadPhoto.mockReturnValue({ mutate: mockUploadPhotoMutate })
  })

  it('renders loading state', () => {
    mockUsePhotos.mockReturnValue({
      data: undefined,
      isLoading: true,
      isFetching: false,
    })

    render(<GalleryScreen />)
    expect(screen.getByTestId('gallery-loading')).toBeTruthy()
  })

  it('renders gallery screen when loaded', () => {
    mockUsePhotos.mockReturnValue({
      data: mockPhotosData,
      isLoading: false,
      isFetching: false,
    })

    render(<GalleryScreen />)
    expect(screen.getByTestId('gallery-screen')).toBeTruthy()
  })

  it('renders photo count in header', () => {
    mockUsePhotos.mockReturnValue({
      data: mockPhotosData,
      isLoading: false,
      isFetching: false,
    })

    render(<GalleryScreen />)
    expect(screen.getByText('2 photos')).toBeTruthy()
  })

  it('renders photos in grid', () => {
    mockUsePhotos.mockReturnValue({
      data: mockPhotosData,
      isLoading: false,
      isFetching: false,
    })

    render(<GalleryScreen />)
    expect(screen.getByTestId('gallery-photo-photo-1')).toBeTruthy()
    expect(screen.getByTestId('gallery-photo-photo-2')).toBeTruthy()
  })

  it('navigates to photo viewer on photo tap', () => {
    mockUsePhotos.mockReturnValue({
      data: mockPhotosData,
      isLoading: false,
      isFetching: false,
    })

    render(<GalleryScreen />)
    fireEvent.press(screen.getByTestId('gallery-photo-photo-1'))
    expect(mockRouter.push).toHaveBeenCalledWith('/plant/plant-1/photo/photo-1')
  })

  it('navigates back when back button pressed', () => {
    mockUsePhotos.mockReturnValue({
      data: mockPhotosData,
      isLoading: false,
      isFetching: false,
    })

    render(<GalleryScreen />)
    fireEvent.press(screen.getByTestId('gallery-back-button'))
    expect(mockRouter.back).toHaveBeenCalledTimes(1)
  })

  it('shows empty state when no photos', () => {
    mockUsePhotos.mockReturnValue({
      data: { items: [], total: 0, hasMore: false },
      isLoading: false,
      isFetching: false,
    })

    render(<GalleryScreen />)
    expect(screen.getByTestId('gallery-empty')).toBeTruthy()
    expect(screen.getByText('No photos yet')).toBeTruthy()
  })

  it('renders add photo button in grid when photos exist', () => {
    mockUsePhotos.mockReturnValue({
      data: mockPhotosData,
      isLoading: false,
      isFetching: false,
    })

    render(<GalleryScreen />)
    expect(screen.getByTestId('gallery-add-photo-button')).toBeTruthy()
  })
})
