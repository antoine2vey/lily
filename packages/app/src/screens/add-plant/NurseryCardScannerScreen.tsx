import { MaterialIcons } from '@expo/vector-icons'
import { CameraView, useCameraPermissions } from 'expo-camera'
import * as ImagePicker from 'expo-image-picker'
import { router } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { iconColors } from 'src/theme'

interface PlantInfo {
  name?: string
  category?: string
}

function parseNurseryCardText(text: string): PlantInfo | null {
  // Simple parsing logic - in production, this would use more sophisticated OCR
  const lines = text.split('\n').filter((line) => line.trim().length > 0)

  if (lines.length === 0) {
    return null
  }

  // Try to find plant name (usually the longest capitalized line)
  const plantName = lines
    .filter((line) => /^[A-Z]/.test(line.trim()))
    .sort((a, b) => b.length - a.length)[0]

  if (!plantName) {
    return null
  }

  return {
    name: plantName.trim(),
    category: undefined,
  }
}

function CameraPermissionRequest({ onRequest }: { onRequest: () => void }) {
  return (
    <View className="flex-1 items-center justify-center px-6 bg-black">
      <MaterialIcons
        name="qr-code-scanner"
        size={64}
        color={iconColors.textMuted}
      />
      <Text className="text-xl text-center mt-4 mb-2 font-semibold text-white">
        Camera Access Required
      </Text>
      <Text className="text-base text-center mb-6 font-regular text-text-muted">
        We need camera access to scan nursery cards. Tap below to grant
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

export function NurseryCardScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions()
  const [isScanning] = useState(true)

  const handlePickFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    })

    if (!result.canceled && result.assets[0]) {
      // In production, send image to OCR service
      // For now, navigate to manual add
      router.push('/add-plant/manual-basic')
    }
  }

  // Note: Text recognition would require a native module like react-native-text-recognition
  // For now, this is a simplified version that navigates to manual add
  const handleScanResult = (text: string) => {
    if (!isScanning) return

    const plantInfo = parseNurseryCardText(text)
    if (plantInfo) {
      const params = new URLSearchParams()
      if (plantInfo.name) params.set('prefillName', plantInfo.name)
      if (plantInfo.category) params.set('prefillCategory', plantInfo.category)
      router.push(`/add-plant/manual-basic?${params.toString()}`)
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
      <CameraView className="flex-1" facing="back">
        <View className="flex-1 items-center justify-center">
          {/* Scan area overlay */}
          <View
            className="w-72 h-48 rounded-xl items-center justify-center border-2 border-primary"
            style={{ backgroundColor: 'transparent' }}
          >
            <View className="absolute inset-0 items-center justify-center">
              <Text className="text-lg font-medium text-white">
                Hold steady...
              </Text>
              <Text className="text-sm mt-1 font-regular text-text-muted">
                Align tag within frame
              </Text>
            </View>
          </View>
        </View>

        {/* Controls */}
        <View className="absolute top-12 left-4">
          <Pressable
            onPress={() => router.back()}
            className="w-10 h-10 rounded-full items-center justify-center"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          >
            <MaterialIcons name="close" size={24} color={iconColors.white} />
          </Pressable>
        </View>

        <View className="absolute bottom-12 right-6">
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
        </View>

        {/* Instructions */}
        <View className="absolute bottom-12 left-0 right-0 items-center">
          <Text className="text-sm font-regular text-white">
            Scan the plant tag or select from gallery
          </Text>
        </View>
      </CameraView>
    </View>
  )
}
