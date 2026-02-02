import { MaterialIcons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Pressable, Text, View } from 'react-native'
import { Avatar } from 'src/components/Avatar'
import { useIconColors } from 'src/hooks/useIconColors'

export function ChatHeader() {
  const { t } = useTranslation('chat')
  const iconColors = useIconColors()

  return (
    <View className="flex-row items-center px-4 py-3 border-b bg-surface dark:bg-surface-dark border-border dark:border-slate-700">
      <Pressable
        onPress={() => router.back()}
        className="w-10 h-10 items-center justify-center"
      >
        <MaterialIcons
          name="arrow-back"
          size={24}
          color={iconColors.textPrimary}
        />
      </Pressable>

      <View className="flex-1 flex-row items-center ml-2">
        <Avatar name="Lily" size="md" />
        <View className="ml-3">
          <Text className="text-base font-semibold text-text-primary dark:text-white">
            {t('header.assistantName')}
          </Text>
          <View className="flex-row items-center">
            <View className="w-2 h-2 rounded-full mr-1.5 bg-primary" />
            <Text className="text-xs font-regular text-text-muted dark:text-slate-400">
              {t('header.online')}
            </Text>
          </View>
        </View>
      </View>
    </View>
  )
}
