import { Option } from 'effect'
import { useTranslation } from 'react-i18next'
import { Text, View } from 'react-native'
import { Button } from '@/components/ui/Button'
import type { OnboardingData } from '@/hooks/useOnboardingFlow'
import { GlassCard } from '../components/GlassCard'
import { OnboardingHero } from '../components/OnboardingHero'

interface CompletionStepProps {
  data: OnboardingData
  onComplete: () => void
}

function SummaryRow({ emoji, text }: { emoji: string; text: string }) {
  return (
    <View className="flex-row items-center py-2">
      <Text className="text-base mr-2">{emoji}</Text>
      <Text
        className="text-sm text-white/70"
        style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
      >
        {text}
      </Text>
    </View>
  )
}

export function CompletionStep({ data, onComplete }: CompletionStepProps) {
  const { t } = useTranslation('onboarding')

  const hasPlant = Option.isSome(Option.fromNullable(data.plantName))

  return (
    <View className="flex-1">
      <OnboardingHero
        emoji="🎉"
        title={t('completion.title')}
        subtitle={
          hasPlant
            ? t('completion.plantAdded', {
                days: String(data.plantDays ?? 7),
              })
            : t('completion.noPlantsYet')
        }
      />

      <GlassCard>
        <View className="mb-4">
          {hasPlant && (
            <SummaryRow
              emoji="🌱"
              text={t('completion.summary.plants', { count: 1 })}
            />
          )}
          {data.roomsCreated && data.roomsCreated > 0 && (
            <SummaryRow
              emoji="🏠"
              text={t('completion.summary.rooms', {
                count: data.roomsCreated,
              })}
            />
          )}
          <SummaryRow
            emoji={data.notificationsEnabled ? '🔔' : '🔕'}
            text={t('completion.summary.notifications', {
              status: data.notificationsEnabled
                ? t('completion.summary.enabled')
                : t('completion.summary.disabled'),
            })}
          />
          <SummaryRow
            emoji={data.weatherEnabled ? '☀️' : '🌥️'}
            text={t('completion.summary.weather', {
              status: data.weatherEnabled
                ? t('completion.summary.enabled')
                : t('completion.summary.disabled'),
            })}
          />
        </View>

        <Button icon="arrow-forward" onPress={onComplete} pill>
          {t('completion.enter')}
        </Button>
      </GlassCard>
    </View>
  )
}
