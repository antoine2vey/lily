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
  it('reports a capture the camera rejects as failed', async () => {
    mockCapturePhotoToFile.mockRejectedValue(new Error('camera closed'))
    const onPhotoCaptured = jest.fn()
    const onCaptureFailed = jest.fn()

    render(
      <AndroidScannerCamera
        isActive
        captureRequested
        onPhotoCaptured={onPhotoCaptured}
        onCaptureFailed={onCaptureFailed}
      />
    )

    await waitFor(() =>
      expect(onCaptureFailed).toHaveBeenCalledWith({ reason: 'camera' })
    )
    expect(onPhotoCaptured).not.toHaveBeenCalled()
  })
})
