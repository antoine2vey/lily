import { MaterialIcons } from '@expo/vector-icons'
import { Option } from 'effect'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import { useIconColors } from '@/hooks/useIconColors'
import type { OnboardingData } from '@/hooks/useOnboardingFlow'
import { getExpoPushToken } from '@/utils/notifications'

interface NotificationStepProps {
  data: OnboardingData
  onNext: (data: { notificationsEnabled: boolean }) => void
  onSkip: () => void
}

export function NotificationStep({
  data,
  onNext,
  onSkip,
}: NotificationStepProps) {
  const { t } = useTranslation('onboarding')
  const iconColors = useIconColors()
  const [loading, setLoading] = useState(false)

  const hasPlant = Option.isSome(Option.fromNullable(data.plantName))

  const title = hasPlant
    ? t('notifications.titleWithPlant', {
        plantName: data.plantName,
        days: String(data.plantDays ?? 7),
      })
    : t('notifications.titleGeneric')

  const handleEnable = async () => {
    setLoading(true)
    const token = await getExpoPushToken()
    setLoading(false)
    onNext({ notificationsEnabled: token !== null })
  }

  return (
    <View className="flex-1 px-6 pt-12">
      {/* Illustration */}
      <View className="items-center mb-10">
        <View className="w-40 h-40 rounded-3xl items-center justify-center bg-blue-50 dark:bg-slate-800">
          <MaterialIcons
            name="notifications-active"
            size={80}
            color={iconColors.waterBlue}
          />
        </View>
      </View>

      <Text
        className="text-2xl font-bold text-text-primary dark:text-white text-center mb-2"
        style={{ fontFamily: 'SpaceGrotesk_700Bold' }}
      >
        {title}
      </Text>
      <Text className="text-base text-text-secondary dark:text-slate-400 text-center mb-10">
        {t('notifications.subtitle')}
      </Text>

      <View className="gap-3 mt-auto mb-4">
        <Pressable
          onPress={handleEnable}
          disabled={loading}
          className="flex-row items-center justify-center py-4 rounded-full bg-primary active:bg-primary-dark"
        >
          {loading ? (
            <ActivityIndicator size="small" color={iconColors.white} />
          ) : (
            <>
              <MaterialIcons
                name="notifications"
                size={20}
                color={iconColors.white}
              />
              <Text
                className="text-base font-semibold text-white ml-2"
                style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
              >
                {t('notifications.enable')}
              </Text>
            </>
          )}
        </Pressable>

        <Pressable onPress={onSkip} className="py-3 items-center">
          <Text className="text-sm text-text-muted dark:text-slate-500">
            {t('notifications.skip')}
          </Text>
        </Pressable>
      </View>
    </View>
  )
}
