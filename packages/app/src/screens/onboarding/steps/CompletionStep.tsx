import { MaterialIcons } from '@expo/vector-icons'
import { Option, pipe } from 'effect'
import { useTranslation } from 'react-i18next'
import { Text, View } from 'react-native'
import { GlassCard, MascotHero } from '@/components'
import { Button } from '@/components/ui/Button'
import { useIconColors } from '@/hooks/useIconColors'
import type { OnboardingData } from '@/hooks/useOnboardingFlow'

interface CompletionStepProps {
  data: OnboardingData
  onComplete: () => void
}

interface SummaryRowProps {
  icon: keyof typeof MaterialIcons.glyphMap
  text: string
}

function SummaryRow({ icon, text }: SummaryRowProps) {
  const iconColors = useIconColors()

  return (
    <View className="flex-row items-center gap-3">
      <View className="w-9 h-9 rounded-full items-center justify-center bg-white/15 border border-white/20">
        <MaterialIcons name={icon} size={18} color={iconColors.white} />
      </View>
      <Text
        className="flex-1 text-sm text-white/85"
        style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
      >
        {text}
      </Text>
    </View>
  )
}

export function CompletionStep({ data, onComplete }: CompletionStepProps) {
  const { t } = useTranslation('onboarding')

  const hasPlant = Option.isSome(Option.fromNullishOr(data.plantName))
  const roomsCreated = pipe(
    Option.fromNullishOr(data.roomsCreated),
    Option.filter((count) => count > 0)
  )
  const statusLabel = (enabled: boolean | undefined) =>
    enabled ? t('completion.summary.enabled') : t('completion.summary.disabled')

  return (
    <View className="flex-1">
      <MascotHero
        animation="celebrate"
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
        <View className="gap-3">
          {hasPlant && (
            <SummaryRow
              icon="eco"
              text={t('completion.summary.plants', { count: 1 })}
            />
          )}
          {Option.match(roomsCreated, {
            onNone: () => null,
            onSome: (count) => (
              <SummaryRow
                icon="meeting-room"
                text={t('completion.summary.rooms', { count })}
              />
            ),
          })}
          <SummaryRow
            icon={
              data.notificationsEnabled
                ? 'notifications-active'
                : 'notifications-off'
            }
            text={t('completion.summary.notifications', {
              status: statusLabel(data.notificationsEnabled),
            })}
          />
          <SummaryRow
            icon={data.weatherEnabled ? 'wb-sunny' : 'cloud-off'}
            text={t('completion.summary.weather', {
              status: statusLabel(data.weatherEnabled),
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
