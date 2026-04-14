import { Option } from 'effect'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, Text, View } from 'react-native'
import { Button } from '@/components/ui/Button'
import type { OnboardingData } from '@/hooks/useOnboardingFlow'
import { getExpoPushToken } from '@/utils/notifications'
import { GlassCard } from '../components/GlassCard'
import { OnboardingHero } from '../components/OnboardingHero'

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
    <View className="flex-1">
      <OnboardingHero
        emoji="🔔"
        title={title}
        subtitle={t('notifications.subtitle')}
      />

      <GlassCard>
        <Button
          icon="notifications"
          iconPosition="left"
          loading={loading}
          onPress={handleEnable}
          pill
        >
          {t('notifications.enable')}
        </Button>

        <Pressable onPress={onSkip} className="mt-4 py-2 items-center">
          <Text
            className="text-sm text-white/40"
            style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
          >
            {t('notifications.skip')}
          </Text>
        </Pressable>
      </GlassCard>
    </View>
  )
}
