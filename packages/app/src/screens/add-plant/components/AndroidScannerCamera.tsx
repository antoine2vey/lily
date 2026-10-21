import type {
  FrameAnalysisEvent,
  PhotoCapturedEvent,
} from '@lily/plant-scanner'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  type StyleProp,
  View,
  type ViewStyle,
} from 'react-native'
import {
  Camera,
  type Frame,
  useCameraDevice,
  useCameraPermission,
  useFrameOutput,
  usePhotoOutput,
} from 'react-native-vision-camera'
import { scheduleOnRN } from 'react-native-worklets'
import { CameraPermissionRequest } from '@/components/scanner'
import { useIconColors } from '@/hooks/useIconColors'

interface Props {
  isActive: boolean
  captureRequested?: boolean
  onFrameAnalysis?: (event: FrameAnalysisEvent) => void
  onPhotoCaptured?: (event: PhotoCapturedEvent) => void
  style?: StyleProp<ViewStyle>
}

// Every Nth pixel of every Nth row of the luma plane; ~4k samples on a 720p frame.
const LUX_SAMPLE_STRIDE = 16
const LUX_EMA_ALPHA = 0.3
const JS_THROTTLE_MS = 200

const luxToLevel = (lux: number): number => {
  'worklet'
  if (lux < 250) return 1
  if (lux < 1_000) return 2
  if (lux < 5_000) return 3
  if (lux < 25_000) return 4
  return 5
}

// Mean luma of the Y plane. YUV 4:2:0 stores luma first, one byte per pixel,
// so no colour conversion is needed to read brightness.
const averageLuma = (frame: Frame): number => {
  'worklet'
  const plane = frame.getPlanes()[0]
  if (plane === undefined) return 0
  const luma = new Uint8Array(plane.getPixelBuffer())
  let sum = 0
  let count = 0
  for (let row = 0; row < plane.height; row += LUX_SAMPLE_STRIDE) {
    const base = row * plane.bytesPerRow
    for (let col = 0; col < plane.width; col += LUX_SAMPLE_STRIDE) {
      sum += luma[base + col] ?? 0
      count++
    }
  }
  return count === 0 ? 0 : sum / count
}

export function AndroidScannerCamera({
  isActive,
  captureRequested,
  onFrameAnalysis,
  onPhotoCaptured,
  style,
}: Props) {
  const { t } = useTranslation('addPlant')
  const iconColors = useIconColors()
  const { hasPermission, requestPermission } = useCameraPermission()
  const device = useCameraDevice('back')
  const photoOutput = usePhotoOutput()

  // The frame worklet captures `emitFrameAnalysis` once; the ref lets the
  // latest `onFrameAnalysis` win without rebuilding the worklet per render.
  const onFrameAnalysisRef = useRef(onFrameAnalysis)
  onFrameAnalysisRef.current = onFrameAnalysis
  const emitFrameAnalysis = useCallback((lux: number, level: number) => {
    onFrameAnalysisRef.current?.({
      plantDetected: false,
      detectionStreak: 0,
      lux,
      luxLevel: level,
      potBbox: null,
      potSizeCm: null,
      potSizeCategory: null,
      potConfidence: null,
    })
  }, [])

  // EMA + throttle state. The worklet runtime unpacks this object once per
  // callback registration and keeps mutating its own copy across frames.
  const luxState = useMemo(() => ({ smoothed: -1, lastEmitMs: 0 }), [])

  const onFrame = useCallback(
    (frame: Frame) => {
      'worklet'
      try {
        // Same calibration curve as iOS LuxAnalyzer.
        const clamped = Math.max(1, Math.min(255, averageLuma(frame)))
        const rawLux = (clamped / 25) ** 3.2 * 15

        // EMA smoothing; the first sample seeds the filter.
        if (luxState.smoothed < 0) {
          luxState.smoothed = rawLux
        } else {
          luxState.smoothed += LUX_EMA_ALPHA * (rawLux - luxState.smoothed)
        }

        // Frames arrive at ~30fps; the UI needs ~5Hz lux updates.
        const nowMs = Date.now()
        if (nowMs - luxState.lastEmitMs < JS_THROTTLE_MS) return
        luxState.lastEmitMs = nowMs

        const lux = luxState.smoothed
        scheduleOnRN(emitFrameAnalysis, lux, luxToLevel(lux))
      } finally {
        frame.dispose()
      }
    },
    [luxState, emitFrameAnalysis]
  )

  // Android PRIVATE frames expose no pixel buffer; ask for YUV explicitly.
  const frameOutput = useFrameOutput({ pixelFormat: 'yuv', onFrame })
  const outputs = useMemo(
    () => [photoOutput, frameOutput],
    [photoOutput, frameOutput]
  )

  // Permission gate: request on mount if not yet granted.
  useEffect(() => {
    if (!hasPermission) requestPermission()
  }, [hasPermission, requestPermission])

  // Photo capture: edge-triggered on captureRequested flipping true.
  const isCapturingRef = useRef(false)
  useEffect(() => {
    if (!captureRequested || isCapturingRef.current) return
    isCapturingRef.current = true
    photoOutput
      .capturePhotoToFile({ flashMode: 'off' }, {})
      .then((photo) => {
        onPhotoCaptured?.({ path: `file://${photo.filePath}` })
      })
      .finally(() => {
        isCapturingRef.current = false
      })
  }, [captureRequested, onPhotoCaptured, photoOutput])

  if (!hasPermission) {
    return (
      <CameraPermissionRequest
        onRequest={requestPermission}
        icon="camera-alt"
        description={t('scanner.cameraPermission')}
      />
    )
  }

  if (!device) {
    return (
      <View
        style={style}
        className="flex-1 items-center justify-center bg-black"
      >
        <ActivityIndicator size="large" color={iconColors.primary} />
      </View>
    )
  }

  return (
    <Camera
      style={style}
      device={device}
      isActive={isActive}
      outputs={outputs}
    />
  )
}
