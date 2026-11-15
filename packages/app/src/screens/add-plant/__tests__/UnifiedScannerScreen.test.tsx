import type { FrameAnalysisEvent } from '@lily/plant-scanner'
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import * as ImagePicker from 'expo-image-picker'
import { UnifiedScannerScreen } from '../UnifiedScannerScreen'

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

// The native view takes one photo per increase of this counter.
const captureGeneration = () => nativeScanner().props.captureGeneration

describe('UnifiedScannerScreen', () => {
  beforeEach(() => {
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockClear()
    jest
      .mocked(ImagePicker.launchImageLibraryAsync)
      .mockResolvedValue({ canceled: true, assets: null })
  })

  it('requests a capture again after the native capture fails', () => {
    render(<UnifiedScannerScreen />)

    fireEvent(nativeScanner(), 'frameAnalysis', frame(5))
    expect(captureGeneration()).toBe(1)

    fireEvent(nativeScanner(), 'captureFailed', {
      nativeEvent: { reason: 'noFrame' },
    })
    fireEvent(nativeScanner(), 'frameAnalysis', frame(5))
    expect(captureGeneration()).toBe(2)
  })

  it('requests a capture again when the failure and the next detection share a render', () => {
    render(<UnifiedScannerScreen />)

    fireEvent(nativeScanner(), 'frameAnalysis', frame(5))
    expect(captureGeneration()).toBe(1)

    act(() => {
      fireEvent(nativeScanner(), 'captureFailed', {
        nativeEvent: { reason: 'noFrame' },
      })
      fireEvent(nativeScanner(), 'frameAnalysis', frame(6))
    })
    expect(captureGeneration()).toBe(2)
  })

  it('requests one capture while a capture or its identification runs', async () => {
    render(<UnifiedScannerScreen />)

    fireEvent(nativeScanner(), 'frameAnalysis', frame(5))
    fireEvent(nativeScanner(), 'frameAnalysis', frame(6))
    expect(captureGeneration()).toBe(1)

    await act(async () => {
      fireEvent(nativeScanner(), 'photoCaptured', {
        nativeEvent: { path: 'file://capture.jpg' },
      })
    })
    fireEvent(nativeScanner(), 'frameAnalysis', frame(7))
    expect(captureGeneration()).toBe(1)
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
