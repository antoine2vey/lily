import { MaterialIcons } from '@expo/vector-icons'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'
import { router } from 'expo-router'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Alert, Pressable, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CameraPermissionRequest, ScannerOverlay } from '@/components/scanner'
import { useIconColors } from '@/hooks/useIconColors'
import { useIdentifyPlant } from '@/hooks/useIdentifyPlant'
import { UploadError } from '@/utils/upload'

export function AIScannerScreen() {
  const { t } = useTranslation('addPlant')
  const iconColors = useIconColors()
  const [permission, requestPermission] = useCameraPermissions()
  const [isCapturing, setIsCapturing] = useState(false)
  const cameraRef = useRef<CameraView>(null)
  const insets = useSafeAreaInsets()
  const { mutateAsync: identify } = useIdentifyPlant()

  const navigateWithResult = (
    photoUri: string,
    result: Awaited<ReturnType<typeof identify>>
  ) => {
    router.push(
      `/add-plant/ai-results?photoUri=${encodeURIComponent(photoUri)}&result=${encodeURIComponent(JSON.stringify(result))}`
    )
  }

  const handlePickFromGallery = async () => {
    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    })

    if (!pickerResult.canceled && pickerResult.assets[0]) {
      setIsCapturing(true)
      try {
        // Convert to JPEG — iOS photos are often HEIC which OpenAI doesn't support
        const image = ImageManipulator.manipulate(pickerResult.assets[0].uri)
        const rendered = await image.renderAsync()
        const jpeg = await rendered.saveAsync({
          compress: 0.8,
          format: SaveFormat.JPEG,
        })
        const aiResult = await identify(jpeg.uri)
        navigateWithResult(jpeg.uri, aiResult)
      } catch (error) {
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
      } finally {
        setIsCapturing(false)
      }
    }
  }

  const handleCapture = async () => {
    if (cameraRef.current && !isCapturing) {
      setIsCapturing(true)
      try {
        const photo = await cameraRef.current.takePictureAsync()
        if (photo?.uri) {
          const aiResult = await identify(photo.uri)
          navigateWithResult(photo.uri, aiResult)
        }
      } catch (error) {
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
        icon="camera-alt"
        description={t('scanner.cameraPermission')}
      />
    )
  }

  return (
    <View className="flex-1 bg-black">
      <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />

      {/* Overlay UI - positioned absolutely on top of camera */}
      <View className="absolute inset-0" pointerEvents="box-none">
        {/* Top bar with back button */}
        <View
          className="absolute top-0 left-0 right-0 z-10 flex-row items-center px-4"
          style={{ paddingTop: insets.top + 8 }}
        >
          <Pressable
            onPress={() => router.back()}
            className="w-10 h-10 rounded-full items-center justify-center"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          >
            <MaterialIcons name="close" size={24} color={iconColors.white} />
          </Pressable>
        </View>

        {/* Dark overlay with cutout */}
        <ScannerOverlay
          statusText={t('scanner.holdSteady')}
          helperText={t('scanner.positionPlant')}
        />

        {/* Bottom controls */}
        <View
          className="absolute bottom-0 left-0 right-0 flex-row items-center justify-between px-12"
          style={{ paddingBottom: insets.bottom + 24 }}
        >
          <Pressable
            onPress={handlePickFromGallery}
            className="w-12 h-12 rounded-full items-center justify-center"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          >
            <MaterialIcons
              name="photo-library"
              size={24}
              color={iconColors.white}
            />
          </Pressable>

          <Pressable
            onPress={handleCapture}
            disabled={isCapturing}
            className="w-[72px] h-[72px] rounded-full items-center justify-center border-4 border-white"
            style={{ opacity: isCapturing ? 0.7 : 1 }}
          >
            {isCapturing ? (
              <ActivityIndicator size="small" color={iconColors.white} />
            ) : (
              <View className="w-[56px] h-[56px] rounded-full bg-white" />
            )}
          </Pressable>

          {/* Spacer to keep capture button centered */}
          <View className="w-12 h-12" />
        </View>
      </View>
    </View>
  )
}
