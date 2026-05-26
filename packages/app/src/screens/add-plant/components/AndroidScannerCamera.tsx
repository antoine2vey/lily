import type {
  FrameAnalysisEvent,
  PhotoCapturedEvent,
} from '@lily/plant-scanner'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  type StyleProp,
  View,
  type ViewStyle,
} from 'react-native'
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useFrameProcessor,
} from 'react-native-vision-camera'
import { useRunOnJS } from 'react-native-worklets-core'
import { useResizePlugin } from 'vision-camera-resize-plugin'
import { CameraPermissionRequest } from '@/components/scanner'
import { useIconColors } from '@/hooks/useIconColors'

interface Props {
  isActive: boolean
  captureRequested?: boolean
  onFrameAnalysis?: (event: FrameAnalysisEvent) => void
  onPhotoCaptured?: (event: PhotoCapturedEvent) => void
  style?: StyleProp<ViewStyle>
}

const LUX_SAMPLE_WIDTH = 32
const LUX_SAMPLE_HEIGHT = 32
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
  const cameraRef = useRef<Camera>(null)
  const { resize } = useResizePlugin()

  // EMA + throttle state lives in refs so worklet captures stable refs.
  // Worklets see ref.value as a JSI primitive snapshot — we cheat by using
  // a shared mutable object the worklet writes to via `as any`.
  const luxStateRef = useRef({ smoothed: -1, lastEmitMs: 0 })

  const emitFrameAnalysis = useRunOnJS(
    (lux: number, level: number) => {
      onFrameAnalysis?.({
        plantDetected: false,
        detectionStreak: 0,
        lux,
        luxLevel: level,
        potBbox: null,
        potSizeCm: null,
        potSizeCategory: null,
        potConfidence: null,
      })
    },
    [onFrameAnalysis]
  )

  const frameProcessor = useFrameProcessor(
    (frame) => {
      'worklet'
      // Downsample to a small RGB buffer; per-frame allocation is ~1KB so
      // the GC pressure is negligible at 30fps.
      const rgb = resize(frame, {
        scale: { width: LUX_SAMPLE_WIDTH, height: LUX_SAMPLE_HEIGHT },
        pixelFormat: 'rgb',
        dataType: 'uint8',
      })

      // Rec. 601 luminance, averaged across all sampled pixels.
      let sum = 0
      const pixelCount = LUX_SAMPLE_WIDTH * LUX_SAMPLE_HEIGHT
      for (let i = 0; i < pixelCount; i++) {
        const base = i * 3
        const r = rgb[base] ?? 0
        const g = rgb[base + 1] ?? 0
        const b = rgb[base + 2] ?? 0
        sum += 0.299 * r + 0.587 * g + 0.114 * b
      }
      const avgBrightness = sum / pixelCount

      // Same calibration curve as iOS LuxAnalyzer.
      const clamped = Math.max(1, Math.min(255, avgBrightness))
      const rawLux = (clamped / 25) ** 3.2 * 15

      // EMA smoothing — first sample seeds the filter.
      const state = luxStateRef.current as unknown as {
        smoothed: number
        lastEmitMs: number
      }
      if (state.smoothed < 0) {
        state.smoothed = rawLux
      } else {
        state.smoothed += LUX_EMA_ALPHA * (rawLux - state.smoothed)
      }

      // Throttle JS bridge crossings — frame processor runs at 30fps but
      // the UI doesn't need more than ~5Hz lux updates.
      const nowMs = Date.now()
      if (nowMs - state.lastEmitMs < JS_THROTTLE_MS) return
      state.lastEmitMs = nowMs

      const lux = state.smoothed
      emitFrameAnalysis(lux, luxToLevel(lux))
    },
    [resize, emitFrameAnalysis]
  )

  // Permission gate — request on mount if not yet granted.
  useEffect(() => {
    if (!hasPermission) requestPermission()
  }, [hasPermission, requestPermission])

  // Photo capture: edge-triggered on captureRequested flipping true.
  const isCapturingRef = useRef(false)
  useEffect(() => {
    if (!captureRequested || isCapturingRef.current || !cameraRef.current)
      return
    isCapturingRef.current = true
    cameraRef.current
      .takePhoto({ flash: 'off' })
      .then((photo) => {
        onPhotoCaptured?.({ path: `file://${photo.path}` })
      })
      .finally(() => {
        isCapturingRef.current = false
      })
  }, [captureRequested, onPhotoCaptured])

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
      ref={cameraRef}
      style={style}
      device={device}
      isActive={isActive}
      photo
      frameProcessor={frameProcessor}
    />
  )
}
