import { MaterialIcons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { Image, Pressable, Text, View } from 'react-native'
import { iconColors } from 'src/theme'

interface PhotoPickerProps {
  photo: string | null
  onPickPhoto: (uri: string) => void
  placeholder?: string
}

export function PhotoPicker({
  photo,
  onPickPhoto,
  placeholder = 'Tap to add photo',
}: PhotoPickerProps) {
  const handlePickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    })

    if (!result.canceled && result.assets[0]) {
      onPickPhoto(result.assets[0].uri)
    }
  }

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') {
      return
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    })

    if (!result.canceled && result.assets[0]) {
      onPickPhoto(result.assets[0].uri)
    }
  }

  return (
    <View className="items-center mb-6">
      <Pressable
        onPress={handlePickPhoto}
        onLongPress={handleTakePhoto}
        className="w-32 h-32 rounded-2xl items-center justify-center overflow-hidden border-2 border-dashed border-border bg-surface active:border-primary active:bg-primary-tint active:opacity-90"
      >
        {photo ? (
          <Image
            source={{ uri: photo }}
            className="w-full h-full"
            resizeMode="cover"
          />
        ) : (
          <>
            <MaterialIcons
              name="add-a-photo"
              size={32}
              color={iconColors.textMuted}
            />
            <Text className="text-sm mt-2 text-center px-2 font-regular text-text-muted">
              {placeholder}
            </Text>
          </>
        )}
      </Pressable>
      {photo && (
        <Pressable onPress={handlePickPhoto} className="mt-2">
          <Text className="text-sm font-medium text-primary">Change photo</Text>
        </Pressable>
      )}
    </View>
  )
}
