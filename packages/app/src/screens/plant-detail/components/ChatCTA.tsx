import { MaterialIcons } from '@expo/vector-icons'
import { useTranslation } from 'react-i18next'
import { Pressable, Text, View } from 'react-native'
import { useIconColors } from 'src/hooks/useIconColors'

interface ChatCTAProps {
  plantName: string
  onPress: () => void
}

export function ChatCTA({ plantName, onPress }: ChatCTAProps) {
  const { t } = useTranslation('plantDetail')
  const iconColors = useIconColors()
  return (
    <Pressable
      onPress={onPress}
      className="bg-surface dark:bg-surface-dark rounded-3xl p-5 border border-primary/20 shadow-lg active:bg-surface-tinted dark:active:bg-slate-700"
      testID="chat-cta"
    >
      <View className="flex-row items-center">
        {/* AI Icon */}
        <View className="w-12 h-12 rounded-full bg-primary items-center justify-center mr-4">
          <MaterialIcons name="auto-awesome" size={24} color="white" />
        </View>

        {/* Text Content */}
        <View className="flex-1">
          <Text className="text-base font-bold text-text-primary dark:text-white">
            {t('chatCta.title', { plantName })}
          </Text>
          <Text className="text-sm text-text-muted dark:text-slate-400 mt-0.5">
            {t('chatCta.subtitle')}
          </Text>
        </View>

        {/* Arrow */}
        <View className="w-8 h-8 rounded-full bg-primary/10 items-center justify-center">
          <MaterialIcons
            name="arrow-forward"
            size={18}
            color={iconColors.primary}
          />
        </View>
      </View>
    </Pressable>
  )
}
