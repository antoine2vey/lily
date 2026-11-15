import type { FrameAnalysisEvent } from '@lily/plant-scanner'
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import * as ImagePicker from 'expo-image-picker'
import { UnifiedScannerScreen } from '../UnifiedScannerScreen'

const mockCommittedRequests: boolean[] = []

jest.mock('@lily/plant-scanner', () => {
  const actual = jest.requireActual('@lily/plant-scanner')
  return {
    ...actual,
    ExpoPlantScannerView: (props: { captureRequested?: boolean }) => {
      mockCommittedRequests.push(props.captureRequested === true)
      return <actual.ExpoPlantScannerView {...props} />
    },
  }
})

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), dismissAll: jest.fn() },
  useLocalSearchParams: () => ({}),
}))

jest.mock('@/hooks/useDetectPlant', () => ({
  useDetectPlant: () => ({
    mutateAsync: jest.fn().mockResolvedValue({ name: 'Monstera' }),
  }),
}))

jest.mock('@/hooks/useCreatePlant', () => ({
  useCreatePlant: () => ({ mutate: jest.fn(), isPending: false }),
}))

jest.mock('@/hooks/useMyCanopy', () => ({
  useMyCanopy: () => ({ data: undefined }),
}))

jest.mock('@/screens/add-plant/components/AndroidScannerCamera', () => ({
  AndroidScannerCamera: () => null,
}))

const frame = (
  detectionStreak: number
): { nativeEvent: FrameAnalysisEvent } => ({
  nativeEvent: {
    plantDetected: detectionStreak > 0,
    detectionStreak,
    lux: 800,
    luxLevel: 2,
    potBbox: null,
    potSizeCm: null,
    potSizeCategory: null,
    potConfidence: null,
  },
})

const nativeScanner = () =>
  screen.UNSAFE_getByType('ViewManagerAdapter_ExpoPlantScanner' as never)

// The native view takes a photo each time the prop changes to true.
const nativeCaptureCount = () =>
  mockCommittedRequests.filter(
    (requested, i) => requested && mockCommittedRequests[i - 1] !== true
  ).length

describe('UnifiedScannerScreen', () => {
  beforeEach(() => {
    mockCommittedRequests.length = 0
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockClear()
    jest
      .mocked(ImagePicker.launchImageLibraryAsync)
      .mockResolvedValue({ canceled: true, assets: null })
  })

  it('requests a capture again after the native capture fails', () => {
    render(<UnifiedScannerScreen />)

    fireEvent(nativeScanner(), 'frameAnalysis', frame(5))
    expect(nativeScanner().props.captureRequested).toBe(true)

    fireEvent(nativeScanner(), 'captureFailed', {
      nativeEvent: { reason: 'noFrame' },
    })
    expect(nativeScanner().props.captureRequested).toBe(false)

    fireEvent(nativeScanner(), 'frameAnalysis', frame(5))
    expect(nativeScanner().props.captureRequested).toBe(true)
  })

  it('requests a capture again when the failure and the next detection share a render', () => {
    render(<UnifiedScannerScreen />)

    fireEvent(nativeScanner(), 'frameAnalysis', frame(5))
    expect(nativeCaptureCount()).toBe(1)

    act(() => {
      fireEvent(nativeScanner(), 'captureFailed', {
        nativeEvent: { reason: 'noFrame' },
      })
      fireEvent(nativeScanner(), 'frameAnalysis', frame(6))
    })
    expect(nativeCaptureCount()).toBe(2)
  })

  it('lowers the capture request once the photo is captured', async () => {
    render(<UnifiedScannerScreen />)

    fireEvent(nativeScanner(), 'frameAnalysis', frame(5))
    await act(async () => {
      fireEvent(nativeScanner(), 'photoCaptured', {
        nativeEvent: { path: 'file://capture.jpg' },
      })
    })
    expect(nativeScanner().props.captureRequested).toBe(false)

    fireEvent(nativeScanner(), 'frameAnalysis', frame(5))
    expect(nativeScanner().props.captureRequested).toBe(false)
  })

  it('opens the gallery after the native capture fails', async () => {
    render(<UnifiedScannerScreen />)

    fireEvent(nativeScanner(), 'frameAnalysis', frame(5))
    fireEvent(nativeScanner(), 'captureFailed', {
      nativeEvent: { reason: 'noFrame' },
    })
    await act(async () => {
      fireEvent.press(screen.getByText('Choose from gallery'))
    })

    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(1)
  })
})
