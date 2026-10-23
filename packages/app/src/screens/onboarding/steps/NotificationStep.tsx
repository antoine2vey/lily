import { Option, pipe } from 'effect'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Image, Text, View } from 'react-native'
import { images } from '@/assets/images'
import { GlassCard, GlassLink, MascotHero } from '@/components'
import { Button } from '@/components/ui/Button'
import { useThemeContext } from '@/contexts/ThemeContext'
import type { OnboardingData } from '@/hooks/useOnboardingFlow'
import { getExpoPushToken } from '@/utils/notifications'

interface NotificationStepProps {
  data: OnboardingData
  onNext: (data: { notificationsEnabled: boolean }) => void
  onSkip: () => void
}

/** A static reminder styled like an iOS notification banner. */
function ReminderPreview({ body }: { body: string }) {
  const { t } = useTranslation('onboarding')
  const { isDark } = useThemeContext()

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="flex-row items-center gap-3 w-full max-w-[340px] mt-6 p-3 rounded-2xl bg-white/15 border border-white/20"
    >
      <Image
        source={isDark ? images.appIconDark : images.appIconLight}
        className="w-10 h-10 rounded-[10px]"
      />
      <View className="flex-1">
        <View className="flex-row items-center justify-between">
          <Text
            className="text-sm text-white"
            style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
          >
            Lily
          </Text>
          <Text
            className="text-xs text-white/60"
            style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
          >
            {t('notifications.previewTime')}
          </Text>
        </View>
        <Text
          className="text-sm text-white/85 mt-0.5"
          numberOfLines={2}
          style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
        >
          {body}
        </Text>
      </View>
    </View>
  )
}

export function NotificationStep({
  data,
  onNext,
  onSkip,
}: NotificationStepProps) {
  const { t } = useTranslation('onboarding')
  const [loading, setLoading] = useState(false)

  const hasPlant = Option.isSome(Option.fromNullishOr(data.plantName))

  const title = hasPlant
    ? t('notifications.titleWithPlant', {
        plantName: data.plantName,
        days: String(data.plantDays ?? 7),
      })
    : t('notifications.titleGeneric')

  const previewBody = t('notifications.previewBody', {
    plantName: pipe(
      Option.fromNullishOr(data.plantName),
      Option.getOrElse(() => t('notifications.previewPlant'))
    ),
  })

  const handleEnable = async () => {
    setLoading(true)
    const token = await getExpoPushToken()
    setLoading(false)
    onNext({ notificationsEnabled: token !== null })
  }

  return (
    <View className="flex-1">
      <MascotHero
        animation="bell"
        title={title}
        subtitle={t('notifications.subtitle')}
      >
        <ReminderPreview body={previewBody} />
      </MascotHero>

      <GlassCard>
        <View className="gap-2">
          <Button
            icon="notifications"
            iconPosition="left"
            loading={loading}
            onPress={handleEnable}
            pill
          >
            {t('notifications.enable')}
          </Button>

          <GlassLink label={t('notifications.skip')} onPress={onSkip} />
        </View>
      </GlassCard>
    </View>
  )
}
