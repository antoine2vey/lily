import { fireEvent, render, screen } from '@testing-library/react-native'
import {
  mockRouter,
  resetNavigationMocks,
  setMockSearchParams,
} from '@/__tests__/mocks/navigation'
import { mockFixedDate } from '@/__tests__/utils/dates'
import { PhotoViewerScreen } from '../PhotoViewerScreen'

// Mock the hooks
const mockUseEffectQuery = jest.fn()
const mockDeletePhotoMutate = jest.fn()
const mockUseDeletePhoto = jest.fn()

jest.mock('@/utils/client', () => ({
  useEffectQuery: (...args: unknown[]) => mockUseEffectQuery(...args),
}))

jest.mock('@/hooks/useDeletePhoto', () => ({
  useDeletePhoto: () => mockUseDeletePhoto(),
}))

describe('PhotoViewerScreen', () => {
  // The viewer reads getPlantPhotos (a paginated list response).
  // The carousel sorts newest-first, so the timestamps must be fixed and
  // distinct: two mockNow() calls occasionally straddled a millisecond,
  // nondeterministically reversing the order (flaky on CI).
  const mockPlantWithPhotos = {
    items: [
      {
        id: 'photo-1',
        url: 'https://example.com/photo1.jpg',
        takenAt: mockFixedDate(2026, 6, 2),
        plantId: 'plant-1',
      },
      {
        id: 'photo-2',
        url: 'https://example.com/photo2.jpg',
        takenAt: mockFixedDate(2026, 6, 1),
        plantId: 'plant-1',
      },
    ],
    total: 2,
    page: 1,
    limit: 100,
    hasMore: false,
  }

  beforeEach(() => {
    jest.clearAllMocks()
    resetNavigationMocks()
    setMockSearchParams({ plantId: 'plant-1', photoId: 'photo-1' })
    mockUseDeletePhoto.mockReturnValue({ mutate: mockDeletePhotoMutate })
  })

  it('renders loading state', () => {
    mockUseEffectQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
    })

    render(<PhotoViewerScreen />)
    expect(screen.getByTestId('photo-viewer-loading')).toBeTruthy()
  })

  it('renders error state when photo not found', () => {
    mockUseEffectQuery.mockReturnValue({
      data: { ...mockPlantWithPhotos, items: [] },
      isLoading: false,
    })

    render(<PhotoViewerScreen />)
    expect(screen.getByTestId('photo-viewer-error')).toBeTruthy()
    expect(screen.getByText('Photo not found')).toBeTruthy()
  })

  it('renders a swipeable carousel of all photos', () => {
    mockUseEffectQuery.mockReturnValue({
      data: mockPlantWithPhotos,
      isLoading: false,
    })

    render(<PhotoViewerScreen />)
    expect(screen.getByTestId('photo-viewer-screen')).toBeTruthy()

    // The visible (deep-linked) slide must be mounted
    expect(screen.getByTestId('photo-viewer-slide-photo-1')).toBeTruthy()

    // The second slide sits on the next page of a virtualized list, so its
    // cell may legitimately not be mounted while off-screen (asserting on
    // it was flaky on CI) — assert the carousel was fed every photo instead
    const carousel = screen.getByTestId('photo-viewer-carousel')
    expect(carousel.props.data).toMatchObject([
      { id: 'photo-1' },
      { id: 'photo-2' },
    ])
  })

  it('shows pagination dots when there is more than one photo', () => {
    mockUseEffectQuery.mockReturnValue({
      data: mockPlantWithPhotos,
      isLoading: false,
    })

    render(<PhotoViewerScreen />)
    expect(screen.getByTestId('photo-viewer-dots')).toBeTruthy()
  })

  it('hides pagination dots for a single photo', () => {
    mockUseEffectQuery.mockReturnValue({
      data: {
        ...mockPlantWithPhotos,
        items: [mockPlantWithPhotos.items[0]],
        total: 1,
      },
      isLoading: false,
    })

    render(<PhotoViewerScreen />)
    expect(screen.queryByTestId('photo-viewer-dots')).toBeNull()
  })

  it('renders back button', () => {
    mockUseEffectQuery.mockReturnValue({
      data: mockPlantWithPhotos,
      isLoading: false,
    })

    render(<PhotoViewerScreen />)
    expect(screen.getByTestId('photo-viewer-back-button')).toBeTruthy()
  })

  it('navigates back when back button pressed', () => {
    mockUseEffectQuery.mockReturnValue({
      data: mockPlantWithPhotos,
      isLoading: false,
    })

    render(<PhotoViewerScreen />)
    fireEvent.press(screen.getByTestId('photo-viewer-back-button'))
    expect(mockRouter.back).toHaveBeenCalledTimes(1)
  })

  it('renders delete button', () => {
    mockUseEffectQuery.mockReturnValue({
      data: mockPlantWithPhotos,
      isLoading: false,
    })

    render(<PhotoViewerScreen />)
    expect(screen.getByTestId('photo-viewer-delete-button')).toBeTruthy()
  })

  it('shows confirmation modal when delete button pressed', () => {
    mockUseEffectQuery.mockReturnValue({
      data: mockPlantWithPhotos,
      isLoading: false,
    })

    render(<PhotoViewerScreen />)
    fireEvent.press(screen.getByTestId('photo-viewer-delete-button'))
    expect(screen.getByText('Delete Photo?')).toBeTruthy()
  })

  it('calls delete mutation when confirmed', () => {
    mockUseEffectQuery.mockReturnValue({
      data: mockPlantWithPhotos,
      isLoading: false,
    })

    render(<PhotoViewerScreen />)
    fireEvent.press(screen.getByTestId('photo-viewer-delete-button'))
    fireEvent.press(screen.getByText('Delete Photo'))

    // Deletes the currently-visible photo (the deep-linked one) optimistically.
    expect(mockDeletePhotoMutate).toHaveBeenCalledWith({
      path: { id: 'plant-1', photoId: 'photo-1' },
    })
  })

  it('closes modal when cancel pressed', () => {
    mockUseEffectQuery.mockReturnValue({
      data: mockPlantWithPhotos,
      isLoading: false,
    })

    render(<PhotoViewerScreen />)
    fireEvent.press(screen.getByTestId('photo-viewer-delete-button'))
    expect(screen.getByText('Delete Photo?')).toBeTruthy()

    fireEvent.press(screen.getByText('Keep Photo'))
    expect(screen.queryByText('Delete Photo?')).toBeNull()
  })
})
