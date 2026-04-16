import { MaterialIcons } from '@expo/vector-icons'
import { MAX_SCAN_FILES } from '@lily/shared'
import { Array as Arr } from 'effect'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'
import { router } from 'expo-router'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AnimatedImage } from '@/components/AnimatedImage'
import { CameraPermissionRequest, ScannerOverlay } from '@/components/scanner'
import { useIconColors } from '@/hooks/useIconColors'
import { useScanCard, useScanCardMultiple } from '@/hooks/useScanCard'
import { UploadError } from '@/utils/upload'

export function NurseryCardScannerScreen() {
  const { t } = useTranslation('addPlant')
  const iconColors = useIconColors()
  const [permission, requestPermission] = useCameraPermissions()
  const [isCapturing, setIsCapturing] = useState(false)
  const [capturedPhotos, setCapturedPhotos] = useState<string[]>([])
  const cameraRef = useRef<CameraView>(null)
  const insets = useSafeAreaInsets()
  const { mutateAsync: scanCard } = useScanCard()
  const { mutateAsync: scanCardMultiple, isPending: isScanning } =
    useScanCardMultiple()

  const canCapture = Arr.length(capturedPhotos) < MAX_SCAN_FILES

  const navigateWithResult = (
    photoUri: string,
    result: Awaited<ReturnType<typeof scanCard>>
  ) => {
    router.push(
      `/add-plant/ai-results?photoUri=${encodeURIComponent(photoUri)}&result=${encodeURIComponent(JSON.stringify(result))}`
    )
  }

  const addPhoto = (uri: string) => {
    setCapturedPhotos((prev) => [...prev, uri])
  }

  const removePhoto = (index: number) => {
    setCapturedPhotos((prev) => Arr.remove(prev, index))
  }

  const handleScanAll = async () => {
    if (Arr.isEmptyReadonlyArray(capturedPhotos)) return

    const firstPhoto = Arr.unsafeGet(capturedPhotos, 0)

    const handleScanError = (error: unknown) => {
      if (
        error instanceof UploadError &&
        error.apiError?._tag === 'LimitExceededError'
      ) {
        Alert.alert(t('scanner.scanLimitReached'), error.message)
      } else {
        Alert.alert(t('scanner.scanFailed'), t('scanner.scanFailedMessage'))
      }
    }

    // Single photo: use single scan endpoint
    if (Arr.length(capturedPhotos) === 1) {
      try {
        const result = await scanCard(firstPhoto)
        navigateWithResult(firstPhoto, result)
      } catch (error) {
        handleScanError(error)
      }
      return
    }

    // Multiple photos of same card: use multi-image endpoint
    try {
      const result = await scanCardMultiple(capturedPhotos)
      navigateWithResult(firstPhoto, result)
    } catch (error) {
      handleScanError(error)
    }
  }

  const handlePickFromGallery = async () => {
    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: MAX_SCAN_FILES - Arr.length(capturedPhotos),
    })

    if (
      !pickerResult.canceled &&
      !Arr.isEmptyReadonlyArray(pickerResult.assets)
    ) {
      setIsCapturing(true)
      try {
        const uris: string[] = []
        for (const asset of pickerResult.assets) {
          const image = ImageManipulator.manipulate(asset.uri)
          const rendered = await image.renderAsync()
          const jpeg = await rendered.saveAsync({
            compress: 0.8,
            format: SaveFormat.JPEG,
          })
          uris.push(jpeg.uri)
        }
        setCapturedPhotos((prev) => [
          ...prev,
          ...Arr.take(uris, MAX_SCAN_FILES - Arr.length(prev)),
        ])
      } catch {
        Alert.alert(t('scanner.error'), t('scanner.failedToProcess'))
      } finally {
        setIsCapturing(false)
      }
    }
  }

  const handleCapture = async () => {
    if (cameraRef.current && !isCapturing && canCapture) {
      setIsCapturing(true)
      try {
        const photo = await cameraRef.current.takePictureAsync()
        if (photo?.uri) {
          const image = ImageManipulator.manipulate(photo.uri)
          const rendered = await image.renderAsync()
          const jpeg = await rendered.saveAsync({
            compress: 0.8,
            format: SaveFormat.JPEG,
          })
          addPhoto(jpeg.uri)
        }
      } catch {
        Alert.alert(t('scanner.error'), t('scanner.failedToCapture'))
      } finally {
        setIsCapturing(false)
      }
    }
  }

  if (!permission) {
    return (
      <View className="flex-1 items-center justify-center bg-black">
        <ActivityIndicator size="large" color={iconColors.primary} />
      </View>
    )
  }

  if (!permission.granted) {
    return (
      <CameraPermissionRequest
        onRequest={requestPermission}
        icon="qr-code-scanner"
        description={t('scanner.cameraPermissionCard')}
      />
    )
  }

  return (
    <View className="flex-1 bg-black">
      <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />

      {/* Overlay UI - positioned absolutely on top of camera */}
      <View className="absolute inset-0" pointerEvents="box-none">
        {/* Top bar with back button and counter */}
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
          {!Arr.isEmptyReadonlyArray(capturedPhotos) && (
            <View
              className="px-3 py-1.5 rounded-full"
              style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
            >
              <Text className="text-sm font-semibold text-white">
                {Arr.length(capturedPhotos)}/{MAX_SCAN_FILES}
              </Text>
            </View>
          )}
        </View>

        {/* Dark overlay with cutout */}
        <ScannerOverlay
          statusText={
            canCapture ? t('scanner.holdSteady') : t('scanner.limitReached')
          }
          helperText={
            canCapture
              ? t('scanner.alignTag')
              : t('scanner.tapToProcess', { count: Arr.length(capturedPhotos) })
          }
        />

        <View
          className="absolute bottom-0 left-0 right-0"
          pointerEvents="box-none"
        >
          <View>
            {/* Thumbnail strip */}
            {!Arr.isEmptyReadonlyArray(capturedPhotos) && (
              <View className="px-4 mb-4">
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8, paddingTop: 8 }}
                >
                  {Arr.map(capturedPhotos, (uri, index) => (
                    <View key={uri} className="relative">
                      <AnimatedImage
                        source={{ uri }}
                        className="w-16 h-16 rounded-lg"
                      />
                      <Pressable
                        onPress={() => removePhoto(index)}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-coral items-center justify-center"
                      >
                        <MaterialIcons
                          name="close"
                          size={12}
                          color={iconColors.white}
                        />
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>
          {/* Bottom controls */}
          <View
            className="flex-row items-center justify-between px-12"
            style={{ paddingBottom: insets.bottom + 24 }}
          >
            <Pressable
              onPress={handlePickFromGallery}
              disabled={!canCapture || isCapturing || isScanning}
              className="w-12 h-12 rounded-full items-center justify-center"
              style={{
                backgroundColor: 'rgba(0,0,0,0.5)',
                opacity: canCapture ? 1 : 0.4,
              }}
            >
              <MaterialIcons
                name="photo-library"
                size={24}
                color={iconColors.white}
              />
            </Pressable>

            {!Arr.isEmptyReadonlyArray(capturedPhotos) ? (
              <Pressable
                onPress={handleScanAll}
                disabled={isScanning}
                className="px-8 py-4 rounded-full bg-primary"
                style={{ opacity: isScanning ? 0.7 : 1 }}
              >
                {isScanning ? (
                  <ActivityIndicator size="small" color={iconColors.white} />
                ) : (
                  <Text className="text-base font-semibold text-white">
                    {Arr.length(capturedPhotos) === 1
                      ? t('scanner.scanCard')
                      : t('scanner.scanAll', {
                          count: Arr.length(capturedPhotos),
                        })}
                  </Text>
                )}
              </Pressable>
            ) : (
              <Pressable
                onPress={handleCapture}
                disabled={isCapturing || !canCapture}
                className="w-[72px] h-[72px] rounded-full items-center justify-center border-4 border-white"
                style={{ opacity: isCapturing ? 0.7 : 1 }}
              >
                {isCapturing ? (
                  <ActivityIndicator size="small" color={iconColors.white} />
                ) : (
                  <View className="w-[56px] h-[56px] rounded-full bg-white" />
                )}
              </Pressable>
            )}

            {/* Capture button (smaller) when photos exist */}
            {!Arr.isEmptyReadonlyArray(capturedPhotos) && canCapture ? (
              <Pressable
                onPress={handleCapture}
                disabled={isCapturing || isScanning}
                className="w-12 h-12 rounded-full items-center justify-center border-2 border-white"
                style={{ opacity: isCapturing ? 0.7 : 1 }}
              >
                {isCapturing ? (
                  <ActivityIndicator size="small" color={iconColors.white} />
                ) : (
                  <View className="w-9 h-9 rounded-full bg-white" />
                )}
              </Pressable>
            ) : (
              <View className="w-12 h-12" />
            )}
          </View>
        </View>
      </View>
    </View>
  )
}
