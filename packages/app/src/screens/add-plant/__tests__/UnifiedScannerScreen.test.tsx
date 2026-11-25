import type { FrameAnalysisEvent } from '@lily/plant-scanner'
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import * as ImagePicker from 'expo-image-picker'
import { Alert } from 'react-native'
import { UnifiedScannerScreen } from '../UnifiedScannerScreen'

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), dismissAll: jest.fn() },
  useLocalSearchParams: () => ({}),
}))

const mockDetectPlant = jest.fn()
jest.mock('@/hooks/useDetectPlant', () => ({
  useDetectPlant: () => ({ mutateAsync: mockDetectPlant }),
}))

jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: {
    manipulate: (uri: string) => ({
      renderAsync: async () => ({
        saveAsync: async () => ({ uri: `${uri}.jpg` }),
      }),
    }),
  },
  SaveFormat: { JPEG: 'jpeg' },
}))

const mockCreatePlant = jest.fn()
jest.mock('@/hooks/useCreatePlant', () => ({
  useCreatePlant: () => ({ mutate: mockCreatePlant, isPending: false }),
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

// Stands in for the native view, which answers each capture request with one
// photo.
const answerCaptureRequests = async (answered: number) => {
  const requested = captureGeneration()
  for (let request = answered; request < requested; request++) {
    await act(async () => {
      fireEvent(nativeScanner(), 'photoCaptured', {
        nativeEvent: { path: `file://capture-${request + 1}.jpg` },
      })
    })
  }
}

const holdPickerOpen = () => {
  let settle!: {
    resolve: (result: ImagePicker.ImagePickerResult) => void
    reject: (error: Error) => void
  }
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockImplementation(
    () =>
      new Promise((resolve, reject) => {
        settle = { resolve, reject }
      })
  )
  return {
    pick: (uri: string) =>
      act(async () =>
        settle.resolve({
          canceled: false,
          assets: [{ uri, width: 100, height: 100 }],
        })
      ),
    cancel: () =>
      act(async () => settle.resolve({ canceled: true, assets: null })),
    fail: () => act(async () => settle.reject(new Error('picker crashed'))),
  }
}

const pressGallery = () =>
  act(async () => {
    fireEvent.press(screen.getByText('Choose from gallery'))
  })

const quickAddIdentified = async (petToxicityRating: number | null) => {
  mockDetectPlant.mockResolvedValue({
    name: 'Monstera',
    petToxicityRating,
    imageUrl: 'https://example.test/monstera.jpg',
  })
  const picker = holdPickerOpen()
  render(<UnifiedScannerScreen />)
  await pressGallery()
  await picker.pick('file://picked.heic')
  fireEvent.press(screen.getByText('Add to Collection'))
  return mockCreatePlant.mock.calls[0][0].payload
}

describe('UnifiedScannerScreen', () => {
  beforeEach(() => {
    mockDetectPlant.mockReset().mockResolvedValue({ name: 'Monstera' })
    mockCreatePlant.mockReset()
    jest.mocked(ImagePicker.launchImageLibraryAsync).mockClear()
    jest
      .mocked(ImagePicker.launchImageLibraryAsync)
      .mockResolvedValue({ canceled: true, assets: null })
  })

  afterEach(() => {
    jest.restoreAllMocks()
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

  describe('while the gallery picker is open', () => {
    it('requests no capture when the camera reaches the detection streak', async () => {
      holdPickerOpen()
      render(<UnifiedScannerScreen />)
      await pressGallery()

      fireEvent(nativeScanner(), 'frameAnalysis', frame(5))

      expect(captureGeneration()).toBe(0)
    })

    it('identifies the picked image and nothing else', async () => {
      const picker = holdPickerOpen()
      render(<UnifiedScannerScreen />)
      await pressGallery()

      fireEvent(nativeScanner(), 'frameAnalysis', frame(5))
      await answerCaptureRequests(0)
      await picker.pick('file://picked.heic')

      expect(mockDetectPlant.mock.calls).toEqual([['file://picked.heic.jpg']])
    })

    it('opens one picker when the gallery button is pressed twice', async () => {
      holdPickerOpen()
      render(<UnifiedScannerScreen />)

      await pressGallery()
      await pressGallery()

      expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(1)
    })

    it('keeps the scan pill hidden when no plant is in view', async () => {
      holdPickerOpen()
      render(<UnifiedScannerScreen />)
      await pressGallery()

      expect(screen.queryByText('Plant detected')).toBeNull()
    })
  })

  it('scans again after the gallery picker is cancelled', async () => {
    const picker = holdPickerOpen()
    render(<UnifiedScannerScreen />)
    await pressGallery()

    await picker.cancel()

    expect(mockDetectPlant).not.toHaveBeenCalled()
    fireEvent(nativeScanner(), 'frameAnalysis', frame(5))
    expect(captureGeneration()).toBe(1)
  })

  it('reports the failure and scans again after the gallery picker fails', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    const picker = holdPickerOpen()
    render(<UnifiedScannerScreen />)
    await pressGallery()

    await picker.fail()

    expect(alert).toHaveBeenCalledWith(
      'Identification Failed',
      expect.any(String)
    )
    expect(mockDetectPlant).not.toHaveBeenCalled()
    fireEvent(nativeScanner(), 'frameAnalysis', frame(5))
    expect(captureGeneration()).toBe(1)
  })

  describe('quick add', () => {
    it('creates a plant that is not pet-safe when the identification has no pet toxicity', async () => {
      const payload = await quickAddIdentified(null)

      expect(payload.petToxicityRating).toBe(100)
    })

    it('keeps the pet toxicity the identification gives', async () => {
      const payload = await quickAddIdentified(20)

      expect(payload.petToxicityRating).toBe(20)
    })
  })
})
