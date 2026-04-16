import { MaterialIcons } from '@expo/vector-icons'
import { Option, pipe, String } from 'effect'
import { useTranslation } from 'react-i18next'
import { Pressable, Text, View } from 'react-native'
import { AnimatedImage } from '@/components/AnimatedImage'
import { useIconColors } from '@/hooks/useIconColors'

interface AvatarPickerProps {
  avatarUrl: Option.Option<string>
  name: string
  onPress: () => void
}

export function AvatarPicker({ avatarUrl, name, onPress }: AvatarPickerProps) {
  const { t } = useTranslation('profile')
  const iconColors = useIconColors()
  return (
    <View className="items-center pt-8 pb-8 gap-3">
      <Pressable onPress={onPress}>
        <View className="relative">
          {/* Avatar */}
          <View className="w-28 h-28 rounded-full p-1 border-2 border-border dark:border-slate-700">
            {pipe(
              avatarUrl,
              Option.match({
                onNone: () => (
                  <View className="w-full h-full rounded-full items-center justify-center bg-primary-tint dark:bg-primary/20">
                    <Text className="text-3xl font-bold text-primary">
                      {pipe(
                        name,
                        String.charAt(0),
                        Option.map(String.toUpperCase),
                        Option.getOrElse(() => '')
                      )}
                    </Text>
                  </View>
                ),
                onSome: (url) => (
                  <AnimatedImage
                    source={{ uri: url }}
                    className="w-full h-full"
                    rounded
                  />
                ),
              })
            )}
          </View>

          {/* Edit badge */}
          <View className="absolute bottom-0 right-0 w-8 h-8 rounded-full items-center justify-center bg-surface dark:bg-surface-dark shadow-md border border-border dark:border-slate-700">
            <MaterialIcons name="edit" size={18} color={iconColors.primary} />
          </View>
        </View>
      </Pressable>

      {/* Change Photo text */}
      <Pressable onPress={onPress}>
        <Text className="text-sm font-bold text-primary">
          {t('edit.changePhoto')}
        </Text>
      </Pressable>
    </View>
  )
}
