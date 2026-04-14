import { useTranslation } from 'react-i18next'
import { Pressable, Text, View } from 'react-native'
import { Button } from '@/components/ui/Button'
import { useLocationPermission } from '@/hooks/useLocationPermission'
import { GlassCard } from '../components/GlassCard'
import { OnboardingHero } from '../components/OnboardingHero'

interface LocationStepProps {
  onNext: (data: {
    weatherEnabled: boolean
    latitude?: number
    longitude?: number
  }) => void
  onSkip: () => void
}

export function LocationStep({ onNext, onSkip }: LocationStepProps) {
  const { t } = useTranslation('onboarding')
  const { loading, requestPermission } = useLocationPermission()

  const handleEnable = async () => {
    const location = await requestPermission()
    if (location) {
      onNext({
        weatherEnabled: true,
        latitude: location.latitude,
        longitude: location.longitude,
      })
    } else {
      onNext({ weatherEnabled: false })
    }
  }

  return (
    <View className="flex-1">
      <OnboardingHero
        emoji="☀️"
        title={t('location.title')}
        subtitle={t('location.subtitle')}
      />

      <GlassCard>
        <Button
          icon="location-on"
          iconPosition="left"
          loading={loading}
          onPress={handleEnable}
          pill
        >
          {t('location.enable')}
        </Button>

        <Pressable onPress={onSkip} className="mt-4 py-2 items-center">
          <Text
            className="text-sm text-white/40"
            style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
          >
            {t('location.skip')}
          </Text>
        </Pressable>
      </GlassCard>
    </View>
  )
}
