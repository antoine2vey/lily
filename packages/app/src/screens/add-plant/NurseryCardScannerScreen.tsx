import { MaterialIcons } from '@expo/vector-icons'
import { MAX_SCAN_FILES } from '@lily/shared'
import { Array as Arr } from 'effect'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'
import { router } from 'expo-router'
import { useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useScanCard, useScanCardMultiple } from 'src/hooks/useScanCard'
import { iconColors } from 'src/theme'

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
  const [isCapturing, setIsCapturing] = useState(false)
  const [capturedPhotos, setCapturedPhotos] = useState<string[]>([])
  const cameraRef = useRef<CameraView>(null)
  const insets = useSafeAreaInsets()
  const { mutateAsync: scanCard } = useScanCard()
  const { mutateAsync: scanCardMultiple, isPending: isScanning } =
    useScanCardMultiple()

  const canCapture = capturedPhotos.length < MAX_SCAN_FILES

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
    if (capturedPhotos.length === 0) return

    const firstPhoto = Arr.unsafeGet(capturedPhotos, 0)

    // Single photo: use single scan endpoint
    if (capturedPhotos.length === 1) {
      try {
        const result = await scanCard(firstPhoto)
        navigateWithResult(firstPhoto, result)
      } catch {
        Alert.alert(
          'Scan Failed',
          "We couldn't read the nursery card. Try another photo or add manually."
        )
      }
      return
    }

    // Multiple photos of same card: use multi-image endpoint
    try {
      const result = await scanCardMultiple(capturedPhotos)
      navigateWithResult(firstPhoto, result)
    } catch {
      Alert.alert(
        'Scan Failed',
        "We couldn't read the nursery card. Try again or add manually."
      )
    }
  }

  const handlePickFromGallery = async () => {
    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: MAX_SCAN_FILES - capturedPhotos.length,
    })

    if (!pickerResult.canceled && pickerResult.assets.length > 0) {
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
          ...uris.slice(0, MAX_SCAN_FILES - prev.length),
        ])
      } catch {
        Alert.alert('Error', 'Failed to process selected images.')
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
        Alert.alert('Error', 'Failed to capture photo.')
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
      <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back">
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
          {capturedPhotos.length > 0 && (
            <View
              className="px-3 py-1.5 rounded-full"
              style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
            >
              <Text className="text-sm font-semibold text-white">
                {capturedPhotos.length}/{MAX_SCAN_FILES}
              </Text>
            </View>
          )}
        </View>

        {/* Scan area overlay */}
        <View style={{ flex: 1 }} className="items-center justify-center">
          <View
            className="w-72 h-48 rounded-xl items-center justify-center border-2 border-primary"
            style={{ backgroundColor: 'transparent' }}
          >
            <View className="absolute inset-0 items-center justify-center">
              <Text className="text-lg font-medium text-white">
                {canCapture ? 'Hold steady...' : 'Limit reached'}
              </Text>
              <Text className="text-sm mt-1 font-regular text-text-muted">
                {canCapture
                  ? 'Align tag within frame'
                  : `Tap "Scan All" to process ${capturedPhotos.length} cards`}
              </Text>
            </View>
          </View>
        </View>

        {/* Thumbnail strip */}
        {capturedPhotos.length > 0 && (
          <View className="px-4 mb-3">
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
            >
              {Arr.map(capturedPhotos, (uri, index) => (
                <View key={uri} className="relative">
                  <Image
                    source={{ uri }}
                    className="w-16 h-16 rounded-lg"
                    resizeMode="cover"
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

          {capturedPhotos.length > 0 ? (
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
                  Scan{' '}
                  {capturedPhotos.length === 1
                    ? 'Card'
                    : `All (${capturedPhotos.length})`}
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
          {capturedPhotos.length > 0 && canCapture ? (
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
      </CameraView>
    </View>
  )
}
