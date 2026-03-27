import type { StyleProp, ViewStyle } from 'react-native'

export interface FrameAnalysisEvent {
  plantDetected: boolean
  detectionStreak: number
  lux: number
  luxLevel: number
  potBbox: {
    x: number
    y: number
    width: number
    height: number
  } | null
  potSizeCm: number | null
  potSizeCategory: 'XS' | 'S' | 'M' | 'L' | 'XL' | null
  potConfidence: number | null
}

export type MeasureAxis = 'width' | 'height'

export interface ARMeasurePoint {
  index: number
  axis: MeasureAxis
  x: number
  y: number
  z: number
}

export interface ARMeasurementEvent {
  distanceCm: number
  axis: MeasureAxis
}

export interface ARSessionErrorEvent {
  message: string
}

export interface PhotoCapturedEvent {
  path: string
}

/** Props accepted by the public ExpoPlantScannerView component. */
export interface ExpoPlantScannerViewProps {
  isActive: boolean
  measureMode: boolean
  captureRequested?: boolean
  resetGeneration?: number
  tapPoint?: { x: number; y: number; id: number } | null
  onFrameAnalysis?: (event: FrameAnalysisEvent) => void
  onSessionReady?: () => void
  onSessionError?: (event: ARSessionErrorEvent) => void
  onPointPlaced?: (event: ARMeasurePoint) => void
  onMeasurement?: (event: ARMeasurementEvent) => void
  onPhotoCaptured?: (event: PhotoCapturedEvent) => void
  style?: StyleProp<ViewStyle>
}

/** Expo wraps native events in { nativeEvent: T }. These are the raw prop types. */
export interface NativeEvent<T> {
  nativeEvent: T
}

export interface NativeExpoPlantScannerViewProps {
  isActive: boolean
  measureMode: boolean
  captureRequested?: boolean
  resetGeneration?: number
  tapPoint?: { x: number; y: number; id: number } | null
  onFrameAnalysis?: (event: NativeEvent<FrameAnalysisEvent>) => void
  onSessionReady?: (event: NativeEvent<Record<string, never>>) => void
  onSessionError?: (event: NativeEvent<ARSessionErrorEvent>) => void
  onPointPlaced?: (event: NativeEvent<ARMeasurePoint>) => void
  onMeasurement?: (event: NativeEvent<ARMeasurementEvent>) => void
  onPhotoCaptured?: (event: NativeEvent<PhotoCapturedEvent>) => void
  style?: StyleProp<ViewStyle>
}
