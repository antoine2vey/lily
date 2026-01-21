import { MaterialIcons } from '@expo/vector-icons'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { router } from 'expo-router'
import { useRef, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
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

  const handleCapture = async () => {
    if (cameraRef.current && !isCapturing) {
      setIsCapturing(true)
      try {
        const photo = await cameraRef.current.takePictureAsync()
        if (photo?.uri) {
          const photoUri = encodeURIComponent(photo.uri)
          router.push(`/add-plant/ai-results?photoUri=${photoUri}`)
        }
      } catch {
        // Handle error silently
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
      <CameraView ref={cameraRef} className="flex-1" facing="back">
        <View className="flex-1 items-center justify-center">
          <ScanFrame />
          <Text className="text-base mt-6 font-medium text-white">
            Position your plant in the frame
          </Text>
        </View>

        <View className="absolute bottom-12 left-0 right-0 flex-row items-center justify-between px-12">
          <Pressable
            onPress={() => router.back()}
            className="w-12 h-12 rounded-full items-center justify-center"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          >
            <MaterialIcons name="close" size={28} color={iconColors.white} />
          </Pressable>

          <Pressable
            onPress={handleCapture}
            disabled={isCapturing}
            className="w-[72px] h-[72px] rounded-full items-center justify-center bg-white border-4 border-primary"
            style={{ opacity: isCapturing ? 0.7 : 1 }}
          >
            {isCapturing ? (
              <ActivityIndicator size="small" color={iconColors.primary} />
            ) : (
              <View className="w-14 h-14 rounded-full bg-primary" />
            )}
          </Pressable>

          <Pressable
            className="w-12 h-12 rounded-full items-center justify-center"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          >
            <MaterialIcons
              name="flash-off"
              size={24}
              color={iconColors.white}
            />
          </Pressable>
        </View>
      </CameraView>
    </View>
  )
}
