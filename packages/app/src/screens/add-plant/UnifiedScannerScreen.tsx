import { MaterialIcons } from '@expo/vector-icons'
import { LUMINOSITY_LEVELS, luxToLuminosityLevel } from '@lily/shared'
import { Either, Match, Option, pipe } from 'effect'
import { Image } from 'expo-image'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'
import { router } from 'expo-router'
import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Alert,
  Dimensions,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useFrameProcessor,
} from 'react-native-vision-camera'
import { useRunOnJS } from 'react-native-worklets-core'
import { CameraPermissionRequest } from 'src/components/scanner'
import { LuxOverlay } from 'src/components/scanner/LuxOverlay'
import { PotSizeOverlay } from 'src/components/scanner/PotSizeOverlay'
import { ShimmerEffect } from 'src/components/ui/shimmer/Shimmer'
import { useCreatePlant } from 'src/hooks/useCreatePlant'
import type { DetectPlantResult } from 'src/hooks/useDetectPlant'
import { useDetectPlant } from 'src/hooks/useDetectPlant'
import { useIconColors } from 'src/hooks/useIconColors'
import { usePlantDetectionModel } from 'src/hooks/usePlantDetectionModel'
import { analyzeFrameForLux } from 'src/utils/frame-processors/lux-processor'
import {
  cmToCategory,
  estimatePotSize,
  type PotDetection,
} from 'src/utils/frame-processors/pot-detector'
import { UploadError } from 'src/utils/upload'
import { useResizePlugin } from 'vision-camera-resize-plugin'

const { height: SCREEN_HEIGHT, width: SCREEN_WIDTH } = Dimensions.get('window')
const RESULT_PHOTO_HEIGHT = SCREEN_HEIGHT * 0.35

// How many consecutive "plant detected" frames before auto-capture
const DETECTION_THRESHOLD_FRAMES = 5
// Minimum ms between frame analyses (~300ms = ~3 analyses/sec)
const FRAME_ANALYSIS_INTERVAL = 300

type ScreenState = 'camera' | 'loading' | 'result'
type ScanPhase = 'idle' | 'capturing' | 'uploading' | 'analyzing' | 'result'

export function UnifiedScannerScreen() {
  const { t } = useTranslation('addPlant')
  const iconColors = useIconColors()
  const insets = useSafeAreaInsets()
  const cameraRef = useRef<Camera>(null)
  const { hasPermission, requestPermission } = useCameraPermission()
  const device = useCameraDevice('back')
  const { resize } = useResizePlugin()

  // ML plant detection model (EfficientDet-Lite0, COCO)
  const plantModel = usePlantDetectionModel()
  const actualModel =
    plantModel.state === 'loaded' ? plantModel.model : undefined

  // Screen state
  const [screenState, setScreenState] = useState<ScreenState>('camera')
  const [capturedPhotoUri, setCapturedPhotoUri] = useState<string | null>(null)
  const [result, setResult] = useState<DetectPlantResult | null>(null)
  const [scanPhase, setScanPhase] = useState<ScanPhase>('idle')

  // Hooks
  const { mutateAsync: detectPlant } = useDetectPlant()
  const { mutate: createPlant, isPending: isCreating } = useCreatePlant()

  // Reanimated shared values for frame processor overlays
  const luxValue = useSharedValue(-1)
  const luxLevelValue = useSharedValue(3)

  // Plant detection state (worklet thread)
  const plantDetected = useSharedValue(false)
  const consecutiveDetections = useSharedValue(0)
  const lastAnalysisTime = useSharedValue(0)
  const isCapturing = useSharedValue(false)

  // Pot size detection (shared with PotSizeOverlay)
  const potDetection = useSharedValue<PotDetection | null>(null)

  // Animation values for result transition
  const photoHeight = useSharedValue(SCREEN_HEIGHT)
  const infoOpacity = useSharedValue(0)
  const infoTranslateY = useSharedValue(200)

  // Called from worklet thread via useRunOnJS when plant is stably detected
  const triggerAutoCapture = useCallback(async () => {
    if (!cameraRef.current || scanPhase !== 'idle') return

    try {
      // Phase 1: Capturing photo
      setScanPhase('capturing')
      const photo = await cameraRef.current.takePhoto()
      const photoUri = `file://${photo.path}`
      setCapturedPhotoUri(photoUri)

      // Phase 2: Uploading
      setScanPhase('uploading')

      // Phase 3: Analyzing (detectPlant handles upload + AI)
      setScanPhase('analyzing')
      const aiResult = await detectPlant(photoUri)
      setResult(aiResult)

      // Phase 4: Show result in pill
      setScanPhase('result')
    } catch (error) {
      setScanPhase('idle')
      setCapturedPhotoUri(null)
      isCapturing.value = false

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
  }, [scanPhase, detectPlant, isCapturing, t])

  // Bridge to call triggerAutoCapture from the worklet thread
  const triggerAutoCaptureWorklet = useRunOnJS(triggerAutoCapture, [
    triggerAutoCapture,
  ])

  // UI state updated from worklet via bridge
  const [isPlantVisible, setIsPlantVisible] = useState(false)
  const [detectionStreak, setDetectionStreak] = useState(0)
  const [luxDisplay, setLuxDisplay] = useState(0)
  const [luxLevelDisplay, setLuxLevelDisplay] = useState(3)
  const [debugPot, setDebugPot] = useState<string>('no detection')

  const onFrameUpdate = useCallback(
    (
      detected: boolean,
      streak: number,
      lux: number,
      luxLevel: number,
      potDebug: string
    ) => {
      setIsPlantVisible(detected)
      setDetectionStreak(streak)
      setLuxDisplay(lux)
      setLuxLevelDisplay(luxLevel)
      setDebugPot(potDebug)
      console.log('[POT]', potDebug)
    },
    []
  )
  const onFrameUpdateWorklet = useRunOnJS(onFrameUpdate, [onFrameUpdate])

  // Frame processor: ML plant detection + lux estimation
  const frameProcessor = useFrameProcessor(
    (frame) => {
      'worklet'

      // Skip if already capturing
      if (isCapturing.value) return

      // Throttle: only analyze every FRAME_ANALYSIS_INTERVAL ms
      const now = performance.now()
      if (now - lastAnalysisTime.value < FRAME_ANALYSIS_INTERVAL) return
      lastAnalysisTime.value = now

      // Resize frame to 320x320 RGB (EfficientDet-Lite0 input size)
      const resized = resize(frame, {
        scale: {
          width: 320,
          height: 320,
        },
        pixelFormat: 'rgb',
        dataType: 'uint8',
      })

      // Lux analysis (subsample every 25th pixel from 320x320 ≈ same cost as 64x64)
      const luxData = new Uint8Array(resized)
      const luxResult = analyzeFrameForLux(luxData, 25)

      // Smooth lux value (exponential moving average)
      const prevLux = luxValue.value
      luxValue.value =
        prevLux < 0 ? luxResult.lux : prevLux + 0.3 * (luxResult.lux - prevLux)

      // Map lux to level (inline to avoid cross-function worklet calls)
      const lux = luxValue.value
      if (lux < 250) luxLevelValue.value = 1
      else if (lux < 1_000) luxLevelValue.value = 2
      else if (lux < 5_000) luxLevelValue.value = 3
      else if (lux < 25_000) luxLevelValue.value = 4
      else luxLevelValue.value = 5

      // ML plant detection via EfficientDet-Lite0
      if (actualModel != null) {
        const outputs = actualModel.runSync([resized])

        // EfficientDet output tensors (already TypedArrays):
        // [0] = detection boxes, [1] = class IDs, [2] = scores, [3] = count
        const boxesTensor = outputs[0] as Float32Array | undefined
        const classesTensor = outputs[1] as Float32Array | undefined
        const scoresTensor = outputs[2] as Float32Array | undefined
        const countTensor = outputs[3] as Float32Array | undefined
        const numDetections = countTensor?.[0] ?? 0

        let detected = false
        let bestIdx = -1
        let bestScore = 0
        for (let i = 0; i < numDetections; i++) {
          const classId = classesTensor?.[i] ?? -1
          const score = scoresTensor?.[i] ?? 0
          // COCO: 63 = "potted plant", 58 = "vase"
          if ((classId === 63 || classId === 58) && score > 0.3) {
            detected = true
            if (score > bestScore) {
              bestIdx = i
              bestScore = score
            }
          }
        }

        // Extract pot bounding box and estimate size
        let potDebugStr = `n=${String(Math.round(numDetections))} best=${String(bestIdx)} sc=${String(Math.round(bestScore * 100))}`
        if (bestIdx >= 0 && boxesTensor && bestScore > 0.4) {
          // EfficientDet boxes: [ymin, xmin, ymax, xmax] normalized
          const ymin = boxesTensor[bestIdx * 4]!
          const xmin = boxesTensor[bestIdx * 4 + 1]!
          const ymax = boxesTensor[bestIdx * 4 + 2]!
          const xmax = boxesTensor[bestIdx * 4 + 3]!

          const bboxWidth = xmax - xmin
          const bboxHeight = ymax - ymin
          const sizeCm = estimatePotSize(bboxWidth, 5.6, 4.2)

          potDetection.value = {
            bbox: { x: xmin, y: ymin, width: bboxWidth, height: bboxHeight },
            sizeCm: Math.round(sizeCm),
            sizeCategory: cmToCategory(sizeCm),
            confidence: bestScore,
          }
          potDebugStr += ` box=[${String(Math.round(xmin * 100))},${String(Math.round(ymin * 100))},${String(Math.round(bboxWidth * 100))},${String(Math.round(bboxHeight * 100))}] ${cmToCategory(sizeCm)} ~${String(Math.round(sizeCm))}cm`
        } else {
          potDetection.value = null
        }

        plantDetected.value = detected
        if (detected) {
          consecutiveDetections.value += 1
        } else {
          consecutiveDetections.value = 0
        }
        onFrameUpdateWorklet(
          detected,
          consecutiveDetections.value,
          luxValue.value,
          luxLevelValue.value,
          potDebugStr
        )
      } else {
        // No model yet — still send lux updates
        potDetection.value = null
        onFrameUpdateWorklet(
          false,
          0,
          luxValue.value,
          luxLevelValue.value,
          'no model'
        )
      }

      // TODO: Re-enable auto-capture after pot size overlay testing
      // Auto-capture after stable detection
      // if (
      //   consecutiveDetections.value >= DETECTION_THRESHOLD_FRAMES &&
      //   !isCapturing.value
      // ) {
      //   isCapturing.value = true
      //   consecutiveDetections.value = 0
      //   triggerAutoCaptureWorklet()
      // }
    },
    [actualModel, triggerAutoCaptureWorklet, onFrameUpdateWorklet]
  )

  const handlePickFromGallery = useCallback(async () => {
    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    })

    if (pickerResult.canceled || !pickerResult.assets[0]) return

    try {
      const image = ImageManipulator.manipulate(pickerResult.assets[0].uri)
      const rendered = await image.renderAsync()
      const jpeg = await rendered.saveAsync({
        compress: 0.8,
        format: SaveFormat.JPEG,
      })

      setCapturedPhotoUri(jpeg.uri)
      setScreenState('loading')
      photoHeight.value = SCREEN_HEIGHT

      const aiResult = await detectPlant(jpeg.uri)
      setResult(aiResult)
      setScreenState('result')

      photoHeight.value = withSpring(RESULT_PHOTO_HEIGHT, {
        damping: 20,
        stiffness: 90,
      })
      infoOpacity.value = withTiming(1, { duration: 400 })
      infoTranslateY.value = withSpring(0, {
        damping: 15,
        stiffness: 80,
      })
    } catch (error) {
      setScreenState('camera')
      setCapturedPhotoUri(null)

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
  }, [detectPlant, photoHeight, infoOpacity, infoTranslateY, t])

  const handleTryAgain = useCallback(() => {
    setScreenState('camera')
    setCapturedPhotoUri(null)
    setResult(null)
    isCapturing.value = false
    consecutiveDetections.value = 0
    plantDetected.value = false
    potDetection.value = null
    photoHeight.value = SCREEN_HEIGHT
    infoOpacity.value = 0
    infoTranslateY.value = 200
  }, [
    photoHeight,
    infoOpacity,
    infoTranslateY,
    isCapturing,
    consecutiveDetections,
    plantDetected,
    potDetection,
  ])

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
          potSize: result.potSize,
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
              onRight: (plant) => {
                router.dismissAll()
                router.push(`/plant/${plant.id}`)
              },
            })
          )
        },
      }
    )
  }, [result, createPlant, t])

  // Animated styles
  const photoAnimatedStyle = useAnimatedStyle(() => ({
    height: photoHeight.value,
  }))

  const infoAnimatedStyle = useAnimatedStyle(() => ({
    opacity: infoOpacity.value,
    transform: [{ translateY: infoTranslateY.value }],
  }))

  // Detection indicator style (driven by React state, not shared values)
  const detectionPillStyle = useAnimatedStyle(() => ({
    opacity: isPlantVisible
      ? withTiming(1, { duration: 200 })
      : withTiming(0, { duration: 200 }),
    transform: [
      {
        scale: isPlantVisible
          ? withSpring(1, { damping: 15 })
          : withSpring(0.8),
      },
    ],
  }))

  // Scan frame — scale driven by streak, smooth opacity
  const frameBaseSize = SCREEN_WIDTH * 0.7
  const cornerStyle = useAnimatedStyle(() => {
    const targetScale = isPlantVisible ? 1 - detectionStreak * 0.02 : 1.05
    return {
      opacity: withTiming(isPlantVisible ? 1 : 0, { duration: 500 }),
      transform: [{ scale: withTiming(targetScale, { duration: 500 }) }],
    }
  })

  // Progress bar showing streak toward auto-capture
  const progressFraction = isPlantVisible
    ? Math.min(detectionStreak / DETECTION_THRESHOLD_FRAMES, 1)
    : 0
  const progressStyle = useAnimatedStyle(() => ({
    width:
      `${withTiming(progressFraction * 100, { duration: 200 })}%` as `${number}%`,
    opacity:
      progressFraction > 0
        ? withTiming(1, { duration: 150 })
        : withTiming(0, { duration: 150 }),
  }))

  // Permission handling
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
      <View className="flex-1 items-center justify-center bg-black">
        <Text className="text-white text-base">
          {t('scanner.noCameraDevice')}
        </Text>
      </View>
    )
  }

  return (
    <View className="flex-1 bg-black">
      {/* Camera state — auto-detection active */}
      {screenState === 'camera' && (
        <Animated.View className="flex-1" entering={FadeIn.duration(200)}>
          <Camera
            ref={cameraRef}
            style={{ flex: 1 }}
            device={device}
            isActive={screenState === 'camera'}
            photo={true}
            pixelFormat="rgb"
            frameProcessor={frameProcessor}
          />

          {/* Overlays on camera */}
          <View className="absolute inset-0" pointerEvents="box-none">
            {/* Pot size bounding box + label */}
            <PotSizeOverlay
              detection={potDetection}
              previewWidth={SCREEN_WIDTH}
              previewHeight={SCREEN_HEIGHT}
            />

            {/* Centered scan frame — tightens as detection streak builds */}
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
                {/* Top-left */}
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
                {/* Top-right */}
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
                {/* Bottom-left */}
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
                {/* Bottom-right */}
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
                <MaterialIcons
                  name="close"
                  size={24}
                  color={iconColors.white}
                />
              </Pressable>

              <LuxOverlay level={luxLevelDisplay} lux={luxDisplay} />
            </View>

            {/* Scan phase pill below top bar */}
            {(isPlantVisible || scanPhase !== 'idle') && (
              <Animated.View
                entering={FadeIn.duration(200)}
                exiting={FadeOut.duration(200)}
                className="absolute left-0 right-0 items-center px-6"
                style={{ top: insets.top + 56 }}
              >
                <Animated.View
                  layout={LinearTransition.duration(250)}
                  className="rounded-3xl overflow-hidden"
                  style={{
                    backgroundColor: 'rgba(0,0,0,0.8)',
                    maxWidth: 360,
                  }}
                >
                  {scanPhase === 'result' && result ? (
                    <>
                      {/* Header: photo + name + confidence */}
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
                          <View
                            className="flex-row items-center rounded-full px-2.5 py-1"
                            style={{
                              backgroundColor: 'rgba(255,255,255,0.1)',
                            }}
                          >
                            <MaterialIcons
                              name="water-drop"
                              size={12}
                              color="#60A5FA"
                            />
                            <Text
                              className="text-white text-xs ml-1"
                              style={{
                                fontFamily: 'SpaceGrotesk_500Medium',
                              }}
                            >
                              {t('scanner.everyNDays', {
                                days: result.wateringFrequencyDays,
                              })}
                            </Text>
                          </View>
                        )}
                        {result.luxNeeded && (
                          <View
                            className="flex-row items-center rounded-full px-2.5 py-1"
                            style={{
                              backgroundColor: 'rgba(255,255,255,0.1)',
                            }}
                          >
                            <MaterialIcons
                              name="wb-sunny"
                              size={12}
                              color="#FCD34D"
                            />
                            <Text
                              className="text-white text-xs ml-1"
                              style={{
                                fontFamily: 'SpaceGrotesk_500Medium',
                              }}
                            >
                              {
                                LUMINOSITY_LEVELS[
                                  luxToLuminosityLevel(result.luxNeeded)
                                ].label
                              }
                            </Text>
                          </View>
                        )}
                        {result.humidityRating !== null && (
                          <View
                            className="flex-row items-center rounded-full px-2.5 py-1"
                            style={{
                              backgroundColor: 'rgba(255,255,255,0.1)',
                            }}
                          >
                            <MaterialIcons
                              name="opacity"
                              size={12}
                              color="#60A5FA"
                            />
                            <Text
                              className="text-white text-xs ml-1"
                              style={{
                                fontFamily: 'SpaceGrotesk_500Medium',
                              }}
                            >
                              {String(result.humidityRating)}%
                            </Text>
                          </View>
                        )}
                        {result.petToxicityRating !== null && (
                          <View
                            className="flex-row items-center rounded-full px-2.5 py-1"
                            style={{
                              backgroundColor: 'rgba(255,255,255,0.1)',
                            }}
                          >
                            <MaterialIcons
                              name="pets"
                              size={12}
                              color={
                                result.petToxicityRating <= 30
                                  ? '#5B8C5A'
                                  : '#EF4444'
                              }
                            />
                            <Text
                              className="text-white text-xs ml-1"
                              style={{
                                fontFamily: 'SpaceGrotesk_500Medium',
                              }}
                            >
                              {result.petToxicityRating <= 30
                                ? t('scanner.petSafe')
                                : t('scanner.petToxic')}
                            </Text>
                          </View>
                        )}
                        {result.potSize && (
                          <View
                            className="flex-row items-center rounded-full px-2.5 py-1"
                            style={{
                              backgroundColor: 'rgba(255,255,255,0.1)',
                            }}
                          >
                            <MaterialIcons
                              name="straighten"
                              size={12}
                              color="rgba(255,255,255,0.7)"
                            />
                            <Text
                              className="text-white text-xs ml-1"
                              style={{
                                fontFamily: 'SpaceGrotesk_500Medium',
                              }}
                            >
                              {result.potSize}
                              {result.potSizeCm
                                ? ` ~${String(result.potSizeCm)}cm`
                                : ''}
                            </Text>
                          </View>
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
                          onPress={async () => {
                            if (!capturedPhotoUri) return
                            setScanPhase('analyzing')
                            setResult(null)
                            try {
                              const aiResult =
                                await detectPlant(capturedPhotoUri)
                              setResult(aiResult)
                              setScanPhase('result')
                            } catch {
                              setScanPhase('idle')
                              setCapturedPhotoUri(null)
                              isCapturing.value = false
                              Alert.alert(
                                t('scanner.identificationFailed'),
                                t('scanner.identificationFailedMessage')
                              )
                            }
                          }}
                          className="items-center justify-center rounded-xl px-4 py-3"
                          style={{
                            backgroundColor: 'rgba(255,255,255,0.12)',
                          }}
                        >
                          <MaterialIcons
                            name="refresh"
                            size={20}
                            color="white"
                          />
                        </Pressable>
                      </View>
                    </>
                  ) : (
                    // Loading pill — icon + status text
                    <View className="flex-row items-center px-4 py-2.5">
                      <MaterialIcons
                        name={scanPhase === 'idle' ? 'search' : 'autorenew'}
                        size={16}
                        color="#A7D9A7"
                      />
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

            {/* Debug pot detection info */}
            <View
              className="absolute left-2 right-2"
              style={{ bottom: insets.bottom + 140 }}
              pointerEvents="none"
            >
              <View
                className="rounded-lg px-3 py-2"
                style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
              >
                <Text
                  className="text-white text-xs"
                  style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
                >
                  POT: {debugPot}
                </Text>
              </View>
            </View>

            {/* Bottom: gallery button + hint text */}
            <View
              className="absolute bottom-0 left-0 right-0 items-center"
              style={{ paddingBottom: insets.bottom + 24 }}
            >
              <Text
                className="text-white/60 text-xs mb-4 text-center"
                style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
              >
                {isPlantVisible
                  ? t('scanner.holdSteady')
                  : t('scanner.pointAtPlant')}
              </Text>
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
      )}

      {/* Loading state: freeze frame + shimmer */}
      {screenState === 'loading' && capturedPhotoUri && (
        <Animated.View className="flex-1" entering={FadeIn.duration(300)}>
          <Image
            source={{ uri: capturedPhotoUri }}
            style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT }}
            contentFit="cover"
          />

          {/* Shimmer overlay */}
          <View className="absolute inset-0">
            <ShimmerEffect
              isLoading={true}
              variant="pulse"
              preset="dark"
              opacity={0.4}
              className="flex-1"
            >
              <View className="flex-1" />
            </ShimmerEffect>
          </View>

          {/* Status pill */}
          <View
            className="absolute inset-x-0 items-center"
            style={{ bottom: insets.bottom + 60 }}
          >
            <View
              className="flex-row items-center rounded-full px-5 py-3"
              style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
            >
              <MaterialIcons name="auto-awesome" size={20} color="#5B8C5A" />
              <Text
                className="text-white text-sm ml-2"
                style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
              >
                {t('scanner.identifying')}
              </Text>
            </View>
          </View>

          {/* Close button */}
          <View
            className="absolute top-0 left-0 px-4"
            style={{ paddingTop: insets.top + 8 }}
          >
            <Pressable
              onPress={handleTryAgain}
              className="w-10 h-10 rounded-full items-center justify-center"
              style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
            >
              <MaterialIcons name="close" size={24} color={iconColors.white} />
            </Pressable>
          </View>
        </Animated.View>
      )}

      {/* Result state: photo shrinks + info slides up */}
      {screenState === 'result' && capturedPhotoUri && result && (
        <View className="flex-1 bg-background">
          {/* Photo card */}
          <Animated.View style={photoAnimatedStyle}>
            <Image
              source={{ uri: capturedPhotoUri }}
              style={{ width: SCREEN_WIDTH, height: '100%' }}
              contentFit="cover"
            />

            {/* Confidence badge */}
            <View
              className="absolute bottom-3 left-3 flex-row items-center rounded-full px-3 py-1"
              style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
            >
              <MaterialIcons name="check-circle" size={14} color="#5B8C5A" />
              <Text
                className="text-white text-xs ml-1"
                style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
              >
                {Math.round(result.confidence * 100)}% match
              </Text>
            </View>

            {/* Detected type badge */}
            <View
              className="absolute bottom-3 right-3 rounded-full px-3 py-1"
              style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
            >
              <Text
                className="text-white text-xs"
                style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
              >
                {pipe(
                  Match.value(result.detectedType),
                  Match.when('plant', () => t('scanner.detectedPlant')),
                  Match.when('card', () => t('scanner.detectedCard')),
                  Match.orElse(() => t('scanner.detectedUnknown'))
                )}
              </Text>
            </View>

            {/* Close button */}
            <View
              className="absolute top-0 left-0 px-4"
              style={{ paddingTop: insets.top + 8 }}
            >
              <Pressable
                onPress={() => router.back()}
                className="w-10 h-10 rounded-full items-center justify-center"
                style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
              >
                <MaterialIcons
                  name="close"
                  size={24}
                  color={iconColors.white}
                />
              </Pressable>
            </View>
          </Animated.View>

          {/* Plant info card */}
          <Animated.View style={infoAnimatedStyle} className="flex-1">
            <ScrollView
              className="flex-1 px-4 pt-4"
              contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
            >
              {/* Plant name */}
              <Text
                className="text-2xl text-text-primary"
                style={{ fontFamily: 'SpaceGrotesk_700Bold' }}
              >
                {result.name ?? t('scanner.unknownPlant')}
              </Text>

              {result.family && (
                <Text
                  className="text-sm text-text-secondary mt-0.5"
                  style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
                >
                  {result.family}
                </Text>
              )}

              {/* Chips row */}
              <View className="flex-row flex-wrap gap-2 mt-3">
                {result.category && (
                  <ChipPill icon="eco" label={result.category} />
                )}
                {result.luxNeeded && (
                  <ChipPill
                    icon="wb-sunny"
                    label={
                      LUMINOSITY_LEVELS[luxToLuminosityLevel(result.luxNeeded)]
                        .label
                    }
                  />
                )}
                {result.potSize && (
                  <ChipPill
                    icon="straighten"
                    label={`${result.potSize}${result.potSizeCm ? ` ~${String(result.potSizeCm)}cm` : ''}`}
                  />
                )}
              </View>

              {/* Description */}
              {result.description && (
                <Text
                  className="text-sm text-text-secondary mt-4 leading-5"
                  style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
                >
                  {result.description}
                </Text>
              )}

              {/* Care grid */}
              <View className="mt-4">
                <Text
                  className="text-[11px] text-text-muted uppercase tracking-wide mb-2"
                  style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
                >
                  {t('scanner.careNeeds')}
                </Text>
                <View className="bg-surface rounded-lg p-3">
                  <CareRow
                    icon="water-drop"
                    label={t('scanner.watering')}
                    value={
                      result.wateringFrequencyDays
                        ? t('scanner.everyNDays', {
                            count: result.wateringFrequencyDays,
                          })
                        : '—'
                    }
                  />
                  <CareRow
                    icon="wb-sunny"
                    label={t('scanner.light')}
                    value={
                      result.luxNeeded
                        ? LUMINOSITY_LEVELS[
                            luxToLuminosityLevel(result.luxNeeded)
                          ].label
                        : '—'
                    }
                  />
                  <CareRow
                    icon="opacity"
                    label={t('scanner.humidity')}
                    value={
                      result.humidityRating !== null
                        ? `${String(result.humidityRating)}%`
                        : '—'
                    }
                  />
                  <CareRow
                    icon="pets"
                    label={t('scanner.petSafety')}
                    value={pipe(
                      Match.value(result.petToxicityRating),
                      Match.when(null, () => '—'),
                      Match.when(
                        (v) => v !== null && v <= 30,
                        () => t('scanner.petSafe')
                      ),
                      Match.orElse(() => t('scanner.petToxic'))
                    )}
                  />
                  {result.fertilizationFrequencyDays && (
                    <CareRow
                      icon="grass"
                      label={t('scanner.fertilizer')}
                      value={t('scanner.everyNDays', {
                        count: result.fertilizationFrequencyDays,
                      })}
                    />
                  )}
                  {result.mistingFrequencyDays && (
                    <CareRow
                      icon="shower"
                      label={t('scanner.misting')}
                      value={t('scanner.everyNDays', {
                        count: result.mistingFrequencyDays,
                      })}
                    />
                  )}
                </View>
              </View>

              {/* Watering tips */}
              {result.wateringTips && (
                <View className="mt-4">
                  <Text
                    className="text-[11px] text-text-muted uppercase tracking-wide mb-2"
                    style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
                  >
                    {t('scanner.wateringTips')}
                  </Text>
                  <View className="bg-surface rounded-lg p-3">
                    <Text
                      className="text-sm text-text-secondary leading-5"
                      style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
                    >
                      {result.wateringTips}
                    </Text>
                  </View>
                </View>
              )}
            </ScrollView>

            {/* Bottom action buttons */}
            <View
              className="absolute bottom-0 left-0 right-0 px-4 bg-background"
              style={{
                paddingBottom: insets.bottom + 16,
                paddingTop: 12,
              }}
            >
              <Pressable
                onPress={handleAddToCollection}
                disabled={isCreating || !result.name}
                className="bg-primary active:bg-primary-dark rounded-xl py-4 px-8 items-center"
                style={{
                  opacity: isCreating || !result.name ? 0.6 : 1,
                }}
              >
                <Text
                  className="text-white text-base text-center"
                  style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
                >
                  {isCreating
                    ? t('scanner.adding')
                    : t('scanner.addToCollection')}
                </Text>
              </Pressable>

              <Pressable
                onPress={handleTryAgain}
                className="mt-2 py-3 items-center"
              >
                <Text
                  className="text-sm text-text-secondary"
                  style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
                >
                  {t('scanner.tryAgain')}
                </Text>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      )}
    </View>
  )
}

// Helper components

function ChipPill({
  icon,
  label,
}: {
  icon: keyof typeof MaterialIcons.glyphMap
  label: string
}) {
  return (
    <View
      className="flex-row items-center rounded-full px-3 py-1.5"
      style={{ backgroundColor: 'rgba(91, 140, 90, 0.1)' }}
    >
      <MaterialIcons name={icon} size={14} color="#5B8C5A" />
      <Text
        className="text-xs text-primary ml-1"
        style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
      >
        {label}
      </Text>
    </View>
  )
}

function CareRow({
  icon,
  label,
  value,
}: {
  icon: keyof typeof MaterialIcons.glyphMap
  label: string
  value: string
}) {
  return (
    <View className="flex-row items-center justify-between py-2">
      <View className="flex-row items-center">
        <MaterialIcons name={icon} size={18} color="#5B8C5A" />
        <Text
          className="text-sm text-text-primary ml-2"
          style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
        >
          {label}
        </Text>
      </View>
      <Text
        className="text-sm text-text-secondary"
        style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
      >
        {value}
      </Text>
    </View>
  )
}
