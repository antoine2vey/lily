import { requireNativeViewManager } from 'expo-modules-core'
import { useCallback } from 'react'

import type {
  ARMeasurementEvent,
  ARMeasurePoint,
  ARSessionErrorEvent,
  ExpoPlantScannerViewProps,
  FrameAnalysisEvent,
  NativeEvent,
  NativeExpoPlantScannerViewProps,
  PhotoCapturedEvent,
} from './types'

const NativeView =
  requireNativeViewManager<NativeExpoPlantScannerViewProps>('ExpoPlantScanner')

export function ExpoPlantScannerView({
  onFrameAnalysis,
  onSessionReady,
  onSessionError,
  onPointPlaced,
  onMeasurement,
  onPhotoCaptured,
  ...rest
}: ExpoPlantScannerViewProps) {
  const handleFrameAnalysis = useCallback(
    (e: NativeEvent<FrameAnalysisEvent>) => onFrameAnalysis?.(e.nativeEvent),
    [onFrameAnalysis]
  )

  const handleSessionReady = useCallback(
    () => onSessionReady?.(),
    [onSessionReady]
  )

  const handleSessionError = useCallback(
    (e: NativeEvent<ARSessionErrorEvent>) => onSessionError?.(e.nativeEvent),
    [onSessionError]
  )

  const handlePointPlaced = useCallback(
    (e: NativeEvent<ARMeasurePoint>) => onPointPlaced?.(e.nativeEvent),
    [onPointPlaced]
  )

  const handleMeasurement = useCallback(
    (e: NativeEvent<ARMeasurementEvent>) => onMeasurement?.(e.nativeEvent),
    [onMeasurement]
  )

  const handlePhotoCaptured = useCallback(
    (e: NativeEvent<PhotoCapturedEvent>) => onPhotoCaptured?.(e.nativeEvent),
    [onPhotoCaptured]
  )

  return (
    <NativeView
      {...rest}
      onFrameAnalysis={handleFrameAnalysis}
      onSessionReady={handleSessionReady}
      onSessionError={handleSessionError}
      onPointPlaced={handlePointPlaced}
      onMeasurement={handleMeasurement}
      onPhotoCaptured={handlePhotoCaptured}
    />
  )
}
