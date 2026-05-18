import { MaterialIcons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { Pressable, Text, View } from 'react-native'
import { useIconColors } from '@/hooks/useIconColors'
import { useLocalization } from '@/hooks/useLocalization'

export function AskLilyCta() {
  const router = useRouter()
  const { t } = useLocalization()
  const iconColors = useIconColors()

  return (
    <Pressable
      testID="home-ask-lily-cta"
      onPress={() => router.push('/chat')}
      className="flex-row items-center gap-4 bg-primary-tint dark:bg-surface-dark rounded-[24px] p-4 mb-4 active:opacity-80"
    >
      <View className="w-12 h-12 rounded-full bg-primary items-center justify-center">
        <MaterialIcons name="auto-awesome" size={22} color={iconColors.white} />
      </View>
      <View className="flex-1">
        <Text
          className="text-base text-text-primary dark:text-white"
          style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
        >
          {t('home:askLily.title')}
        </Text>
        <Text
          className="text-sm text-text-secondary dark:text-slate-400 mt-0.5 leading-snug"
          style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
        >
          {t('home:askLily.subtitle')}
        </Text>
      </View>
      <MaterialIcons name="chevron-right" size={24} color={iconColors.muted} />
    </Pressable>
  )
}
