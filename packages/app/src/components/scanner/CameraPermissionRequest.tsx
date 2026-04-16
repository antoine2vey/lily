import { MaterialIcons } from '@expo/vector-icons'
import { Option, pipe } from 'effect'
import { useTranslation } from 'react-i18next'
import { Pressable, Text, View } from 'react-native'
import { useIconColors } from '@/hooks/useIconColors'

interface CameraPermissionRequestProps {
  onRequest: () => void
  icon?: keyof typeof MaterialIcons.glyphMap
  title?: string
  description?: string
}

export function CameraPermissionRequest({
  onRequest,
  icon = 'camera-alt',
  title,
  description,
}: CameraPermissionRequestProps) {
  const { t } = useTranslation('addPlant')
  const iconColors = useIconColors()
  const displayTitle = pipe(
    Option.fromNullable(title),
    Option.getOrElse(() => t('scanner.cameraAccessTitle'))
  )
  const displayDescription = pipe(
    Option.fromNullable(description),
    Option.getOrElse(() => t('scanner.cameraPermission'))
  )

  return (
    <View className="flex-1 items-center justify-center px-6 bg-black">
      <MaterialIcons name={icon} size={64} color={iconColors.textMuted} />
      <Text className="text-xl text-center mt-4 mb-2 font-semibold text-white">
        {displayTitle}
      </Text>
      <Text className="text-base text-center mb-6 font-regular text-text-muted">
        {displayDescription}
      </Text>
      <Pressable
        onPress={onRequest}
        className="px-8 py-4 rounded-xl bg-primary"
      >
        <Text className="text-base font-semibold text-white">
          {t('scanner.enableCamera')}
        </Text>
      </Pressable>
    </View>
  )
}
