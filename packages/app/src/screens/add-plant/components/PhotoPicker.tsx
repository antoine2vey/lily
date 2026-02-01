import { MaterialIcons } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { Image, Pressable, Text, View } from 'react-native'
import { useIconColors } from 'src/hooks/useIconColors'

interface PhotoPickerProps {
  photo: string | null
  onPickPhoto: (uri: string) => void
  placeholder?: string
  subtitle?: string
}

export function PhotoPicker({
  photo,
  onPickPhoto,
  placeholder = 'Tap to add photo',
  subtitle = 'Show off your green friend',
}: PhotoPickerProps) {
  const iconColors = useIconColors()

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

  if (photo) {
    return (
      <View className="items-center mb-6">
        <Pressable
          onPress={handlePickPhoto}
          onLongPress={handleTakePhoto}
          className="w-full aspect-[4/3] rounded-xl overflow-hidden active:opacity-90"
        >
          <Image
            source={{ uri: photo }}
            className="w-full h-full"
            resizeMode="cover"
          />
        </Pressable>
        <Pressable onPress={handlePickPhoto} className="mt-3">
          <Text className="text-sm font-semibold text-primary dark:text-primary-light">
            Change photo
          </Text>
        </Pressable>
      </View>
    )
  }

  return (
    <Pressable
      onPress={handlePickPhoto}
      onLongPress={handleTakePhoto}
      className="mb-6 items-center justify-center gap-4 rounded-xl border-2 border-dashed border-primary/30 bg-surface-tinted/30 dark:bg-slate-800/30 px-6 py-12 active:scale-[0.99]"
    >
      <View className="w-16 h-16 rounded-full bg-surface-tinted dark:bg-slate-800 items-center justify-center">
        <MaterialIcons
          name="add-a-photo"
          size={32}
          color={iconColors.primary}
        />
      </View>
      <View className="items-center gap-2">
        <Text className="text-lg font-bold text-text-primary dark:text-white text-center">
          {placeholder}
        </Text>
        <Text className="text-sm font-regular text-text-secondary dark:text-slate-400 text-center">
          {subtitle}
        </Text>
      </View>
      <View className="mt-2 h-10 px-6 rounded-full bg-primary items-center justify-center">
        <Text className="text-sm font-bold text-white">Add Photo</Text>
      </View>
    </Pressable>
  )
}
