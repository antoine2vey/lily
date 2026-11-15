import { render, waitFor } from '@testing-library/react-native'
import { AndroidScannerCamera } from '../AndroidScannerCamera'

const mockCapturePhotoToFile = jest.fn()

jest.mock('react-native-vision-camera', () => {
  const { View } = jest.requireActual('react-native')
  return {
    Camera: View,
    useCameraDevice: () => ({ id: 'back' }),
    useCameraPermission: () => ({
      hasPermission: true,
      requestPermission: jest.fn(),
    }),
    useFrameOutput: () => ({}),
    usePhotoOutput: () => ({ capturePhotoToFile: mockCapturePhotoToFile }),
  }
})

jest.mock('react-native-worklets', () => ({ scheduleOnRN: jest.fn() }))

describe('AndroidScannerCamera', () => {
  beforeEach(() => {
    mockCapturePhotoToFile.mockReset()
  })

  it('reports a capture the camera rejects as failed', async () => {
    mockCapturePhotoToFile.mockRejectedValue(new Error('camera closed'))
    const onPhotoCaptured = jest.fn()
    const onCaptureFailed = jest.fn()

    render(
      <AndroidScannerCamera
        isActive
        captureGeneration={1}
        onPhotoCaptured={onPhotoCaptured}
        onCaptureFailed={onCaptureFailed}
      />
    )

    await waitFor(() =>
      expect(onCaptureFailed).toHaveBeenCalledWith({ reason: 'camera' })
    )
    expect(onPhotoCaptured).not.toHaveBeenCalled()
  })

  it('captures again when the generation increases after a failure', async () => {
    mockCapturePhotoToFile.mockRejectedValue(new Error('camera closed'))
    const onCaptureFailed = jest.fn()
    const view = render(
      <AndroidScannerCamera
        isActive
        captureGeneration={1}
        onCaptureFailed={onCaptureFailed}
      />
    )
    await waitFor(() => expect(onCaptureFailed).toHaveBeenCalledTimes(1))

    mockCapturePhotoToFile.mockResolvedValue({ filePath: '/tmp/photo.jpg' })
    const onPhotoCaptured = jest.fn()
    view.rerender(
      <AndroidScannerCamera
        isActive
        captureGeneration={2}
        onPhotoCaptured={onPhotoCaptured}
        onCaptureFailed={onCaptureFailed}
      />
    )

    await waitFor(() =>
      expect(onPhotoCaptured).toHaveBeenCalledWith({
        path: 'file:///tmp/photo.jpg',
      })
    )
    expect(mockCapturePhotoToFile).toHaveBeenCalledTimes(2)
  })
})
