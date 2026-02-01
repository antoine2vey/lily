import { MaterialIcons } from '@expo/vector-icons'
import { Pressable, Text, View } from 'react-native'
import { useIconColors } from 'src/hooks/useIconColors'

interface CameraPermissionRequestProps {
  onRequest: () => void
  icon?: keyof typeof MaterialIcons.glyphMap
  title?: string
  description?: string
}

export function CameraPermissionRequest({
  onRequest,
  icon = 'camera-alt',
  title = 'Camera Access Required',
  description = 'We need camera access to continue. Tap below to grant permission.',
}: CameraPermissionRequestProps) {
  const iconColors = useIconColors()

  return (
    <View className="flex-1 items-center justify-center px-6 bg-black">
      <MaterialIcons name={icon} size={64} color={iconColors.textMuted} />
      <Text className="text-xl text-center mt-4 mb-2 font-semibold text-white">
        {title}
      </Text>
      <Text className="text-base text-center mb-6 font-regular text-text-muted">
        {description}
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
