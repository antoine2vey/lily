import { MaterialIcons } from '@expo/vector-icons'
import {
  type ARMeasurementEvent,
  type ARMeasurePoint,
  ExpoPlantScannerView,
  type FrameAnalysisEvent,
  type MeasureAxis,
  type PhotoCapturedEvent,
} from '@lily/plant-scanner'
import { LUMINOSITY_LEVELS, luxToLuminosityLevel } from '@lily/shared'
import { Effect, Either, Match, Option, pipe } from 'effect'
import { Image } from 'expo-image'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'
import { router, useLocalSearchParams } from 'expo-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Alert,
  Dimensions,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native'
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LuxOverlay } from '@/components/scanner/LuxOverlay'
import { advanceFromExternal } from '@/hooks/onboarding-storage'
import { useCreatePlant } from '@/hooks/useCreatePlant'
import type { DetectPlantResult } from '@/hooks/useDetectPlant'
import { useDetectPlant } from '@/hooks/useDetectPlant'
import { useIconColors } from '@/hooks/useIconColors'
import { AndroidScannerCamera } from '@/screens/add-plant/components/AndroidScannerCamera'
import { UploadError } from '@/utils/upload'

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window')
const AUTO_CAPTURE_STREAK = 5

const formatCm = (v: number) => String(Math.round(v * 10) / 10)

const formatPotDimensions = (w: number, h: number) =>
  `${formatCm(w)} x ${formatCm(h)} cm`

const handleDetectionError = (error: unknown, t: (key: string) => string) => {
  if (
    error instanceof UploadError &&
    error.apiError?._tag === 'LimitExceededError'
  ) {
    Alert.alert(t('scanner.scanLimitReached'), error.message)
  } else {
    Alert.alert(
      t('scanner.identificationFailed'),
      t('scanner.identificationFailedMessage')
    )
  }
}

type ScanPhase = 'idle' | 'capturing' | 'uploading' | 'analyzing' | 'result'

export function UnifiedScannerScreen() {
  const { t } = useTranslation('addPlant')
  const iconColors = useIconColors()
  const insets = useSafeAreaInsets()
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>()

  const [capturedPhotoUri, setCapturedPhotoUri] = useState<string | null>(null)
  const [result, setResult] = useState<DetectPlantResult | null>(null)
  const [scanPhase, setScanPhase] = useState<ScanPhase>('idle')

  const [detection, setDetection] = useState({
    plantVisible: false,
    streak: 0,
    lux: 0,
    luxLevel: 3,
  })

  // Shared values for high-frequency detection data (avoids worklet reinstalls)
  const plantVisibleSV = useSharedValue(false)
  const streakSV = useSharedValue(0)

  const [measureMode, setMeasureMode] = useState(false)
  const measureModeRef = useRef(false)
  measureModeRef.current = measureMode
  const [arWidthCm, setArWidthCm] = useState<number | null>(null)
  const [arHeightCm, setArHeightCm] = useState<number | null>(null)
  const [arCurrentAxis, setArCurrentAxis] = useState<MeasureAxis>('width')
  const [arPointCount, setArPointCount] = useState(0)
  const [tapPoint, setTapPoint] = useState<{
    x: number
    y: number
    id: number
  } | null>(null)
  const [resetGeneration, setResetGeneration] = useState(0)
  const [confirmedPot, setConfirmedPot] = useState<{
    widthCm: number
    heightCm: number
  } | null>(null)
  const [captureRequested, setCaptureRequested] = useState(false)
  const isCapturingRef = useRef(false)

  // Hooks
  const { mutateAsync: detectPlant } = useDetectPlant()
  const { mutate: createPlant, isPending: isCreating } = useCreatePlant()

  const scanPhaseRef = useRef<ScanPhase>('idle')
  scanPhaseRef.current = scanPhase

  const handleFrameAnalysis = useCallback(
    (event: FrameAnalysisEvent) => {
      plantVisibleSV.value = event.plantDetected
      streakSV.value = event.detectionStreak
      setDetection({
        plantVisible: event.plantDetected,
        streak: event.detectionStreak,
        lux: Math.round(event.lux),
        luxLevel: event.luxLevel,
      })

      if (
        scanPhaseRef.current === 'idle' &&
        event.detectionStreak >= AUTO_CAPTURE_STREAK &&
        !isCapturingRef.current &&
        !measureMode
      ) {
        isCapturingRef.current = true
        setCaptureRequested(true)
      }
    },
    [measureMode, plantVisibleSV, streakSV]
  )

  const handleARMeasurement = useCallback((event: ARMeasurementEvent) => {
    if (event.axis === 'width') {
      setArWidthCm(event.distanceCm)
      setArCurrentAxis('height')
    } else {
      setArHeightCm(event.distanceCm)
    }
  }, [])

  const resetAR = useCallback(() => {
    setArWidthCm(null)
    setArHeightCm(null)
    setArCurrentAxis('width')
    setArPointCount(0)
    setResetGeneration((g) => g + 1)
  }, [])

  const handlePhotoCaptured = useCallback(
    async (event: PhotoCapturedEvent) => {
      setCaptureRequested(false)
      setCapturedPhotoUri(event.path)
      setScanPhase('uploading')

      try {
        const aiResult = await detectPlant(event.path)
        setResult(aiResult)
        setScanPhase('result')
      } catch (error) {
        setCapturedPhotoUri(null)
        setScanPhase('idle')
        isCapturingRef.current = false
        handleDetectionError(error, t)
      }
    },
    [detectPlant, t]
  )

  const handleConfirmMeasure = useCallback(() => {
    if (arWidthCm != null && arHeightCm != null) {
      setConfirmedPot({ widthCm: arWidthCm, heightCm: arHeightCm })
    }
    setMeasureMode(false)
    resetAR()
  }, [arWidthCm, arHeightCm, resetAR])

  const handlePointPlaced = useCallback((event: ARMeasurePoint) => {
    const base = event.axis === 'width' ? 0 : 2
    setArPointCount(base + event.index + 1)
    setTapPoint(null)
  }, [])

  const handleToggleMeasureMode = useCallback(() => {
    setMeasureMode((prev) => {
      if (prev) resetAR()
      return !prev
    })
  }, [resetAR])

  const handleForceCapture = useCallback(() => {
    if (
      scanPhaseRef.current !== 'idle' ||
      isCapturingRef.current ||
      measureModeRef.current
    )
      return
    isCapturingRef.current = true
    setCaptureRequested(true)
  }, [])

  const handleReanalyze = useCallback(async () => {
    if (!capturedPhotoUri) return
    setScanPhase('analyzing')
    setResult(null)
    try {
      const aiResult = await detectPlant(capturedPhotoUri)
      setResult(aiResult)
      setScanPhase('result')
    } catch (error) {
      setScanPhase('idle')
      setCapturedPhotoUri(null)
      isCapturingRef.current = false
      handleDetectionError(error, t)
    }
  }, [capturedPhotoUri, detectPlant, t])

  const handleDismissResult = useCallback(() => {
    setScanPhase('idle')
    setResult(null)
    setCapturedPhotoUri(null)
    setDetection((prev) => ({ ...prev, streak: 0 }))
    isCapturingRef.current = false
  }, [])

  // MARK: - Shared Handlers

  const handlePickFromGallery = useCallback(async () => {
    if (scanPhaseRef.current !== 'idle' || isCapturingRef.current) return

    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    })

    if (pickerResult.canceled || !pickerResult.assets[0]) return

    isCapturingRef.current = true
    setScanPhase('uploading')

    try {
      const image = ImageManipulator.manipulate(pickerResult.assets[0].uri)
      const rendered = await image.renderAsync()
      const jpeg = await rendered.saveAsync({
        compress: 0.8,
        format: SaveFormat.JPEG,
      })

      setCapturedPhotoUri(jpeg.uri)
      const aiResult = await detectPlant(jpeg.uri)
      setResult(aiResult)
      setScanPhase('result')
    } catch (error) {
      setCapturedPhotoUri(null)
      setScanPhase('idle')
      isCapturingRef.current = false
      handleDetectionError(error, t)
    }
  }, [detectPlant, t])

  const handleAddToCollection = useCallback(() => {
    if (!result?.name) return

    createPlant(
      {
        payload: {
          name: result.name,
          category: Option.getOrUndefined(Option.fromNullable(result.category)),
          description: Option.getOrUndefined(
            Option.fromNullable(result.description)
          ),
          wateringFrequencyDays: Option.getOrElse(
            Option.fromNullable(result.wateringFrequencyDays),
            () => 7
          ),
          fertilizationFrequencyDays: Option.getOrUndefined(
            Option.fromNullable(result.fertilizationFrequencyDays)
          ),
          mistingFrequencyDays: Option.getOrUndefined(
            Option.fromNullable(result.mistingFrequencyDays)
          ),
          repottingFrequencyDays: Option.getOrUndefined(
            Option.fromNullable(result.repottingFrequencyDays)
          ),
          luxNeeded: Option.getOrElse(
            Option.fromNullable(result.luxNeeded),
            () => 2000
          ),
          humidityRating: Option.getOrElse(
            Option.fromNullable(result.humidityRating),
            () => 50
          ),
          petToxicityRating: Option.getOrElse(
            Option.fromNullable(result.petToxicityRating),
            () => 50
          ),
          imageUrl: result.imageUrl,
          potWidthCm: confirmedPot?.widthCm,
          potHeightCm: confirmedPot?.heightCm,
          remindersEnabled: true,
        },
      },
      {
        onSuccess: (apiResult) => {
          pipe(
            apiResult,
            Either.match({
              onLeft: (error) =>
                pipe(
                  Match.value(error),
                  Match.when({ _tag: 'LimitExceededError' }, (e) =>
                    Alert.alert(t('scanner.plantLimitReached'), e.message)
                  ),
                  Match.orElse(() =>
                    Alert.alert(t('scanner.error'), t('errors.createFailed'))
                  )
                ),
              onRight: async (plant) => {
                router.dismissAll()
                if (returnTo === 'onboarding') {
                  await Effect.runPromise(
                    advanceFromExternal(2, {
                      plantName: result?.name ?? plant.name,
                      plantDays: result?.wateringFrequencyDays ?? 7,
                    })
                  )
                  router.replace('/(auth)/onboarding')
                } else {
                  router.push(`/plant/${plant.id}`)
                }
              },
            })
          )
        },
      }
    )
  }, [result, createPlant, confirmedPot, t, returnTo])

  // MARK: - Animated Styles

  const frameBaseSize = SCREEN_WIDTH * 0.7
  const cornerStyle = useAnimatedStyle(() => {
    const visible = plantVisibleSV.value
    const targetScale = visible ? 1 - streakSV.value * 0.02 : 1.05
    return {
      opacity: withTiming(visible ? 1 : 0, { duration: 500 }),
      transform: [{ scale: withTiming(targetScale, { duration: 500 }) }],
    }
  })

  const shouldPulseSV = useSharedValue(false)
  useEffect(() => {
    shouldPulseSV.value = scanPhase === 'result' && confirmedPot === null
  }, [scanPhase, confirmedPot, shouldPulseSV])

  const spinSV = useSharedValue(0)
  const isScanning =
    scanPhase === 'capturing' ||
    scanPhase === 'uploading' ||
    scanPhase === 'analyzing'
  useEffect(() => {
    if (isScanning) {
      spinSV.value = 0
      spinSV.value = withRepeat(
        withTiming(360, { duration: 1000, easing: Easing.linear }),
        -1,
        false
      )
    } else {
      cancelAnimation(spinSV)
      spinSV.value = 0
    }
  }, [isScanning, spinSV])
  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spinSV.value}deg` }],
  }))

  const measureButtonStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: shouldPulseSV.value
          ? withRepeat(
              withSequence(
                withTiming(1.06, { duration: 600 }),
                withTiming(1, { duration: 600 })
              ),
              -1
            )
          : withTiming(1, { duration: 200 }),
      },
    ],
  }))

  // MARK: - Render

  return (
    <View className="flex-1 bg-black">
      <Animated.View className="flex-1" entering={FadeIn.duration(200)}>
        {/* iOS: Native ExpoPlantScannerView (ARKit + TFLite) */}
        {Platform.OS === 'ios' && (
          <ExpoPlantScannerView
            style={{ flex: 1 }}
            isActive
            measureMode={measureMode}
            captureRequested={captureRequested}
            onFrameAnalysis={handleFrameAnalysis}
            onPhotoCaptured={handlePhotoCaptured}
            tapPoint={tapPoint}
            resetGeneration={resetGeneration}
            onMeasurement={handleARMeasurement}
            onPointPlaced={handlePointPlaced}
            onSessionError={(event) => console.warn('[AR]', event.message)}
          />
        )}

        {/* Android: Vision Camera with JS lux frame processor (no AR, no on-device detection). */}
        {Platform.OS === 'android' && (
          <AndroidScannerCamera
            style={{ flex: 1 }}
            isActive
            captureRequested={captureRequested}
            onFrameAnalysis={handleFrameAnalysis}
            onPhotoCaptured={handlePhotoCaptured}
          />
        )}

        {/* AR measurement: crosshair + tap anywhere to confirm */}
        {measureMode && (
          <>
            {/* Crosshair at screen center — color indicates current axis */}
            <View
              className="absolute"
              pointerEvents="none"
              style={{
                left: SCREEN_WIDTH / 2 - 20,
                top: SCREEN_HEIGHT / 2 - 20,
                width: 40,
                height: 40,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {/* Vertical stroke — emphasized when measuring height */}
              <View
                style={{
                  position: 'absolute',
                  width: 2,
                  height: 24,
                  backgroundColor:
                    arCurrentAxis === 'height'
                      ? '#5B8C5A'
                      : 'rgba(255,255,255,0.5)',
                  borderRadius: 1,
                }}
              />
              {/* Horizontal stroke — emphasized when measuring width */}
              <View
                style={{
                  position: 'absolute',
                  width: 24,
                  height: 2,
                  backgroundColor:
                    arCurrentAxis === 'width'
                      ? 'white'
                      : 'rgba(255,255,255,0.5)',
                  borderRadius: 1,
                }}
              />
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  borderWidth: 2,
                  borderColor: arCurrentAxis === 'width' ? 'white' : '#5B8C5A',
                  backgroundColor: 'transparent',
                }}
              />
            </View>
            {/* Tap anywhere to place point at crosshair */}
            <Pressable
              className="absolute inset-0"
              onPress={() => {
                setTapPoint({
                  x: 0.5,
                  y: 0.5,
                  id: Date.now(),
                })
              }}
            />
          </>
        )}

        {/* Overlays on camera */}
        <View className="absolute inset-0" pointerEvents="box-none">
          {/* Centered scan frame */}
          {!measureMode && (
            <Animated.View
              className="absolute inset-0 items-center justify-center"
              style={cornerStyle}
              pointerEvents="none"
            >
              <View
                style={{
                  width: frameBaseSize,
                  height: frameBaseSize,
                }}
              >
                <View
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: 36,
                    height: 36,
                    borderTopWidth: 3,
                    borderLeftWidth: 3,
                    borderColor: 'rgba(255,255,255,0.8)',
                    borderTopLeftRadius: 16,
                  }}
                />
                <View
                  style={{
                    position: 'absolute',
                    top: 0,
                    right: 0,
                    width: 36,
                    height: 36,
                    borderTopWidth: 3,
                    borderRightWidth: 3,
                    borderColor: 'rgba(255,255,255,0.8)',
                    borderTopRightRadius: 16,
                  }}
                />
                <View
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    width: 36,
                    height: 36,
                    borderBottomWidth: 3,
                    borderLeftWidth: 3,
                    borderColor: 'rgba(255,255,255,0.8)',
                    borderBottomLeftRadius: 16,
                  }}
                />
                <View
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    right: 0,
                    width: 36,
                    height: 36,
                    borderBottomWidth: 3,
                    borderRightWidth: 3,
                    borderColor: 'rgba(255,255,255,0.8)',
                    borderBottomRightRadius: 16,
                  }}
                />
              </View>
            </Animated.View>
          )}

          {/* Top bar */}
          <View
            className="absolute top-0 left-0 right-0 z-10 flex-row items-center justify-between px-4"
            style={{ paddingTop: insets.top + 8 }}
          >
            <Pressable
              onPress={() => router.back()}
              className="w-10 h-10 rounded-full items-center justify-center"
              style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
            >
              <MaterialIcons name="close" size={24} color={iconColors.white} />
            </Pressable>

            <LuxOverlay level={detection.luxLevel} lux={detection.lux} />
          </View>

          {/* Scan phase pill below top bar */}
          {!measureMode && (detection.plantVisible || scanPhase !== 'idle') && (
            <Animated.View
              entering={FadeIn.duration(200)}
              exiting={FadeOut.duration(200)}
              className="absolute left-0 right-0 px-4"
              style={{ top: insets.top + 56 }}
            >
              <Animated.View
                layout={LinearTransition.duration(250)}
                className="rounded-3xl overflow-hidden"
                style={{
                  backgroundColor: 'rgba(0,0,0,0.8)',
                }}
              >
                {scanPhase === 'result' && result ? (
                  <>
                    {/* Result pill header */}
                    <View className="flex-row items-center px-4 pt-4 pb-2">
                      {capturedPhotoUri && (
                        <Image
                          source={{ uri: capturedPhotoUri }}
                          style={{
                            width: 52,
                            height: 52,
                            borderRadius: 14,
                          }}
                          contentFit="cover"
                        />
                      )}
                      <View className="flex-1 ml-3 mr-2">
                        <Text
                          className="text-white text-base"
                          style={{
                            fontFamily: 'SpaceGrotesk_600SemiBold',
                          }}
                          numberOfLines={1}
                        >
                          {result.name ?? t('scanner.unknownPlant')}
                        </Text>
                        {result.family && (
                          <Text
                            className="text-xs mt-0.5"
                            style={{
                              fontFamily: 'SpaceGrotesk_400Regular',
                              color: 'rgba(255,255,255,0.5)',
                            }}
                          >
                            {result.family}
                          </Text>
                        )}
                      </View>
                      <View
                        className="rounded-full px-2.5 py-1"
                        style={{
                          backgroundColor: 'rgba(91,140,90,0.5)',
                        }}
                      >
                        <Text
                          className="text-white text-xs"
                          style={{
                            fontFamily: 'SpaceGrotesk_600SemiBold',
                          }}
                        >
                          {Math.round(result.confidence * 100)}%
                        </Text>
                      </View>
                    </View>

                    {/* Care chips */}
                    <View className="flex-row flex-wrap gap-1.5 px-4 pb-3">
                      {result.wateringFrequencyDays && (
                        <CareChip
                          icon="water-drop"
                          color="#60A5FA"
                          label={t('scanner.everyNDays', {
                            days: result.wateringFrequencyDays,
                          })}
                        />
                      )}
                      {result.luxNeeded && (
                        <CareChip
                          icon="wb-sunny"
                          color="#FCD34D"
                          label={
                            LUMINOSITY_LEVELS[
                              luxToLuminosityLevel(result.luxNeeded)
                            ].label
                          }
                        />
                      )}
                      {confirmedPot && (
                        <CareChip
                          icon="straighten"
                          color="rgba(255,255,255,0.7)"
                          label={formatPotDimensions(
                            confirmedPot.widthCm,
                            confirmedPot.heightCm
                          )}
                        />
                      )}
                    </View>

                    {/* Action buttons */}
                    <View className="flex-row gap-2 px-4 pb-4">
                      <Pressable
                        onPress={handleAddToCollection}
                        disabled={isCreating}
                        className="flex-1 items-center justify-center rounded-xl py-3"
                        style={{ backgroundColor: '#5B8C5A' }}
                      >
                        <Text
                          className="text-white text-sm"
                          style={{
                            fontFamily: 'SpaceGrotesk_600SemiBold',
                          }}
                        >
                          {isCreating
                            ? t('scanner.adding')
                            : t('scanner.addToCollection')}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={handleReanalyze}
                        className="items-center justify-center rounded-xl px-4 py-3"
                        style={{
                          backgroundColor: 'rgba(255,255,255,0.12)',
                        }}
                      >
                        <MaterialIcons name="refresh" size={20} color="white" />
                      </Pressable>
                      <Pressable
                        onPress={handleDismissResult}
                        className="items-center justify-center rounded-xl px-4 py-3"
                        style={{
                          backgroundColor: 'rgba(255,255,255,0.12)',
                        }}
                      >
                        <MaterialIcons name="close" size={20} color="white" />
                      </Pressable>
                    </View>
                  </>
                ) : (
                  <View className="flex-row items-center px-4 py-2.5">
                    <Animated.View style={isScanning ? spinStyle : undefined}>
                      <MaterialIcons
                        name={scanPhase === 'idle' ? 'search' : 'autorenew'}
                        size={16}
                        color="#A7D9A7"
                      />
                    </Animated.View>
                    <Text
                      className="text-white text-xs ml-1.5"
                      style={{
                        fontFamily: 'SpaceGrotesk_500Medium',
                      }}
                    >
                      {scanPhase === 'capturing' || scanPhase === 'uploading'
                        ? t('scanner.identifying')
                        : scanPhase === 'analyzing'
                          ? t('scanner.analyzing')
                          : t('scanner.plantDetected')}
                    </Text>
                  </View>
                )}
              </Animated.View>
            </Animated.View>
          )}

          {/* AR Measurement overlay (iOS measure mode) */}
          {measureMode && (
            <View
              className="absolute left-0 right-0 items-center px-6"
              style={{ top: insets.top + 56 }}
            >
              <View
                className="rounded-2xl px-4 py-3"
                style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}
              >
                {/* Instruction text based on current axis and progress */}
                <Text
                  className="text-white text-xs text-center"
                  style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
                >
                  {arCurrentAxis === 'width' && arPointCount === 0
                    ? t('arMeasure.widthInstruction')
                    : arCurrentAxis === 'width' && arPointCount === 1
                      ? t('arMeasure.widthSecondPoint')
                      : arCurrentAxis === 'height' &&
                          arHeightCm === null &&
                          arPointCount <= 2
                        ? t('arMeasure.heightInstruction')
                        : arCurrentAxis === 'height' &&
                            arHeightCm === null &&
                            arPointCount === 3
                          ? t('arMeasure.heightSecondPoint')
                          : t('arMeasure.title')}
                </Text>

                {/* Measurement results */}
                {(arWidthCm !== null || arHeightCm !== null) && (
                  <View className="flex-row justify-center gap-4 mt-2">
                    {arWidthCm !== null && (
                      <View className="flex-row items-center">
                        <MaterialIcons
                          name="swap-horiz"
                          size={14}
                          color="white"
                        />
                        <Text
                          className="text-white text-xs ml-1"
                          style={{
                            fontFamily: 'SpaceGrotesk_600SemiBold',
                          }}
                        >
                          {`${t('arMeasure.widthLabel')}: ${String(Math.round(arWidthCm * 10) / 10)} cm`}
                        </Text>
                      </View>
                    )}
                    {arHeightCm !== null && (
                      <View className="flex-row items-center">
                        <MaterialIcons
                          name="swap-vert"
                          size={14}
                          color="#5B8C5A"
                        />
                        <Text
                          className="text-white text-xs ml-1"
                          style={{
                            fontFamily: 'SpaceGrotesk_600SemiBold',
                          }}
                        >
                          {`${t('arMeasure.heightLabel')}: ${String(Math.round(arHeightCm * 10) / 10)} cm`}
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {/* Confirm/Reset buttons when both measurements done */}
                {arWidthCm !== null && arHeightCm !== null && (
                  <View className="flex-row justify-center gap-3 mt-2">
                    <Pressable
                      onPress={handleConfirmMeasure}
                      className="bg-primary rounded-lg px-4 py-2"
                    >
                      <Text
                        className="text-white text-xs"
                        style={{
                          fontFamily: 'SpaceGrotesk_600SemiBold',
                        }}
                      >
                        {t('arMeasure.confirm')}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={resetAR}
                      className="rounded-lg px-4 py-2"
                      style={{
                        backgroundColor: 'rgba(255,255,255,0.15)',
                      }}
                    >
                      <Text
                        className="text-white text-xs"
                        style={{
                          fontFamily: 'SpaceGrotesk_500Medium',
                        }}
                      >
                        {t('arMeasure.reset')}
                      </Text>
                    </Pressable>
                  </View>
                )}

                {/* Step indicators: 4 dots (2 per axis) */}
                <View className="flex-row justify-center items-center gap-1.5 mt-2">
                  {/* Width dots */}
                  <View
                    className="w-2 h-2 rounded-full"
                    style={{
                      backgroundColor:
                        arPointCount >= 1 ? 'white' : 'rgba(255,255,255,0.3)',
                    }}
                  />
                  <View
                    className="w-2 h-2 rounded-full"
                    style={{
                      backgroundColor:
                        arPointCount >= 2 ? 'white' : 'rgba(255,255,255,0.3)',
                    }}
                  />
                  {/* Separator */}
                  <View
                    className="mx-1"
                    style={{
                      width: 1,
                      height: 8,
                      backgroundColor: 'rgba(255,255,255,0.3)',
                    }}
                  />
                  {/* Height dots */}
                  <View
                    className="w-2 h-2 rounded-full"
                    style={{
                      backgroundColor:
                        arPointCount >= 3 ? '#5B8C5A' : 'rgba(255,255,255,0.3)',
                    }}
                  />
                  <View
                    className="w-2 h-2 rounded-full"
                    style={{
                      backgroundColor:
                        arPointCount >= 4 ? '#5B8C5A' : 'rgba(255,255,255,0.3)',
                    }}
                  />
                </View>
              </View>
            </View>
          )}

          {/* Bottom: buttons */}
          <View
            className="absolute bottom-0 left-0 right-0 items-center"
            style={{ paddingBottom: insets.bottom + 24 }}
          >
            {!measureMode && (
              <Text
                className="text-white/60 text-xs mb-4 text-center"
                style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
              >
                {detection.plantVisible
                  ? t('scanner.holdSteady')
                  : t('scanner.pointAtPlant')}
              </Text>
            )}
            {/* Manual shutter button — visible when idle + no detection */}
            {!measureMode &&
              scanPhase === 'idle' &&
              !detection.plantVisible && (
                <Pressable
                  onPress={handleForceCapture}
                  className="mb-4 w-16 h-16 rounded-full items-center justify-center border-4 border-white/80 bg-white/15"
                >
                  <View className="w-12 h-12 rounded-full bg-white/90" />
                </Pressable>
              )}
            <Pressable
              onPress={handlePickFromGallery}
              className="flex-row items-center rounded-full px-4 py-2.5"
              style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
            >
              <MaterialIcons
                name="photo-library"
                size={20}
                color={iconColors.white}
              />
              <Text
                className="text-white text-sm ml-2"
                style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
              >
                {t('scanner.fromGallery')}
              </Text>
            </Pressable>
            {Platform.OS === 'ios' && (
              <Animated.View style={measureButtonStyle} className="mt-3">
                <Pressable
                  onPress={handleToggleMeasureMode}
                  className="flex-row items-center rounded-full px-4 py-2.5"
                  style={{
                    backgroundColor:
                      (scanPhase === 'result' && !confirmedPot) || measureMode
                        ? 'rgba(91,140,90,0.8)'
                        : 'rgba(0,0,0,0.5)',
                  }}
                >
                  <MaterialIcons
                    name="view-in-ar"
                    size={20}
                    color={iconColors.white}
                  />
                  <Text
                    className="text-white text-sm ml-2"
                    style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
                  >
                    {measureMode
                      ? t('arMeasure.title')
                      : t('arMeasure.measureWithAR')}
                  </Text>
                </Pressable>
              </Animated.View>
            )}
            <Pressable
              onPress={() => {
                router.replace('/add-plant/manual-basic')
              }}
              className="mt-4"
            >
              <Text
                className="text-white/60 text-xs text-center"
                style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
              >
                {t('scanner.addManually')}
              </Text>
            </Pressable>
          </View>
        </View>
      </Animated.View>
    </View>
  )
}

// MARK: - Helper Components

function CareChip({
  icon,
  color,
  label,
}: {
  icon: keyof typeof MaterialIcons.glyphMap
  color: string
  label: string
}) {
  return (
    <View
      className="flex-row items-center rounded-full px-2.5 py-1"
      style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
    >
      <MaterialIcons name={icon} size={12} color={color} />
      <Text
        className="text-white text-xs ml-1"
        style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
      >
        {label}
      </Text>
    </View>
  )
}
