import { useTranslation } from 'react-i18next'
import { Text, View } from 'react-native'
import { Avatar } from '@/components/Avatar'
import { GlassBackButton } from '@/components/GlassBackButton'

interface AskLilyHeaderProps {
  title?: string
  showBack?: boolean
}

export function AskLilyHeader({ title, showBack = true }: AskLilyHeaderProps) {
  const { t } = useTranslation('chat')

  return (
    <View className="flex-row items-center px-4 py-3 border-b bg-background dark:bg-background-dark border-border dark:border-slate-700">
      {showBack ? (
        <GlassBackButton testID="chat-back-button" />
      ) : (
        <View className="w-10" />
      )}

      <View className="flex-1 flex-row items-center ml-2">
        <Avatar name="Lily" size="md" />
        <View className="ml-3">
          <Text className="text-base font-semibold text-text-primary dark:text-white">
            {title ?? t('header.assistantName')}
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
