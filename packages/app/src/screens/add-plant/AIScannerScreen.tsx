import { MaterialIcons } from '@expo/vector-icons'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'
import { router } from 'expo-router'
import { useRef, useState } from 'react'
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useIdentifyPlant } from 'src/hooks/useIdentifyPlant'
import { iconColors } from 'src/theme'

function CameraPermissionRequest({ onRequest }: { onRequest: () => void }) {
  return (
    <View className="flex-1 items-center justify-center px-6 bg-black">
      <MaterialIcons name="camera-alt" size={64} color={iconColors.textMuted} />
      <Text className="text-xl text-center mt-4 mb-2 font-semibold text-white">
        Camera Access Required
      </Text>
      <Text className="text-base text-center mb-6 font-regular text-text-muted">
        We need camera access to identify your plants. Tap below to grant
        permission.
      </Text>
      <Pressable
        onPress={onRequest}
        className="px-8 py-4 rounded-xl bg-primary"
      >
        <Text className="text-base font-semibold text-white">
          Enable Camera
        </Text>
      </Pressable>
    </View>
  )
}

function ScanFrame() {
  return (
    <View className="w-64 h-64 items-center justify-center">
      {/* Top left corner */}
      <View className="absolute top-0 left-0 w-12 h-12">
        <View className="absolute top-0 left-0 right-0 h-1 rounded-full bg-primary" />
        <View className="absolute top-0 left-0 bottom-0 w-1 rounded-full bg-primary" />
      </View>
      {/* Top right corner */}
      <View className="absolute top-0 right-0 w-12 h-12">
        <View className="absolute top-0 left-0 right-0 h-1 rounded-full bg-primary" />
        <View className="absolute top-0 right-0 bottom-0 w-1 rounded-full bg-primary" />
      </View>
      {/* Bottom left corner */}
      <View className="absolute bottom-0 left-0 w-12 h-12">
        <View className="absolute bottom-0 left-0 right-0 h-1 rounded-full bg-primary" />
        <View className="absolute top-0 left-0 bottom-0 w-1 rounded-full bg-primary" />
      </View>
      {/* Bottom right corner */}
      <View className="absolute bottom-0 right-0 w-12 h-12">
        <View className="absolute bottom-0 left-0 right-0 h-1 rounded-full bg-primary" />
        <View className="absolute top-0 right-0 bottom-0 w-1 rounded-full bg-primary" />
      </View>
    </View>
  )
}

export function AIScannerScreen() {
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
      } catch {
        Alert.alert(
          'Identification Failed',
          'We couldn\'t identify this plant. Try another photo or add manually.'
        )
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
      } catch {
        Alert.alert(
          'Identification Failed',
          'We couldn\'t identify this plant. Try another photo or add manually.'
        )
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
    return <CameraPermissionRequest onRequest={requestPermission} />
  }

  return (
    <View className="flex-1 bg-black">
      <CameraView
        ref={cameraRef}
        style={{ flex: 1 }}
        facing="back"
      >
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

        {/* Centered scan frame */}
        <View style={{ flex: 1 }} className="items-center justify-center">
          <ScanFrame />
          <Text className="text-base mt-6 font-medium text-white">
            Position your plant in the frame
          </Text>
        </View>

        {/* Bottom controls */}
        <View
          className="flex-row items-center justify-between px-12"
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
      </CameraView>
    </View>
  )
}
