import { MaterialIcons } from '@expo/vector-icons'
import { Option } from 'effect'
import { useTranslation } from 'react-i18next'
import { Pressable, Text, View } from 'react-native'
import { useIconColors } from '@/hooks/useIconColors'
import type { OnboardingData } from '@/hooks/useOnboardingFlow'

interface CompletionStepProps {
  data: OnboardingData
  onComplete: () => void
}

function SummaryRow({
  icon,
  text,
  color,
}: {
  icon: string
  text: string
  color: string
}) {
  return (
    <View className="flex-row items-center py-2">
      <MaterialIcons name={icon as 'check-circle'} size={20} color={color} />
      <Text className="text-sm text-text-secondary dark:text-slate-400 ml-2">
        {text}
      </Text>
    </View>
  )
}

export function CompletionStep({ data, onComplete }: CompletionStepProps) {
  const { t } = useTranslation('onboarding')
  const iconColors = useIconColors()

  const hasPlant = Option.isSome(Option.fromNullable(data.plantName))

  return (
    <View className="flex-1 px-6 pt-12">
      {/* Illustration */}
      <View className="items-center mb-10">
        <View className="w-40 h-40 rounded-3xl items-center justify-center bg-primary-tint dark:bg-slate-800">
          <MaterialIcons
            name="check-circle"
            size={80}
            color={iconColors.primary}
          />
        </View>
      </View>

      <Text
        className="text-2xl font-bold text-text-primary dark:text-white text-center mb-2"
        style={{ fontFamily: 'SpaceGrotesk_700Bold' }}
      >
        {t('completion.title')}
      </Text>

      {hasPlant ? (
        <Text className="text-base text-text-secondary dark:text-slate-400 text-center mb-8">
          {t('completion.plantAdded', {
            days: String(data.plantDays ?? 7),
          })}
        </Text>
      ) : (
        <Text className="text-base text-text-secondary dark:text-slate-400 text-center mb-8">
          {t('completion.noPlantsYet')}
        </Text>
      )}

      {/* Summary */}
      <View className="bg-surface dark:bg-slate-800 rounded-xl p-5 mb-8">
        {hasPlant && (
          <SummaryRow
            icon="eco"
            text={t('completion.summary.plants', {
              count: 1,
            })}
            color={iconColors.primary}
          />
        )}
        {data.roomsCreated && data.roomsCreated > 0 && (
          <SummaryRow
            icon="room"
            text={t('completion.summary.rooms', {
              count: data.roomsCreated,
            })}
            color={iconColors.primary}
          />
        )}
        <SummaryRow
          icon="notifications"
          text={t('completion.summary.notifications', {
            status: data.notificationsEnabled
              ? t('completion.summary.enabled')
              : t('completion.summary.disabled'),
          })}
          color={
            data.notificationsEnabled
              ? iconColors.waterBlue
              : iconColors.textMuted
          }
        />
        <SummaryRow
          icon="wb-sunny"
          text={t('completion.summary.weather', {
            status: data.weatherEnabled
              ? t('completion.summary.enabled')
              : t('completion.summary.disabled'),
          })}
          color={
            data.weatherEnabled ? iconColors.warning : iconColors.textMuted
          }
        />
      </View>

      <Pressable
        onPress={onComplete}
        className="flex-row items-center justify-center py-4 rounded-full bg-primary active:bg-primary-dark mt-auto mb-4"
      >
        <Text
          className="text-base font-semibold text-white mr-2"
          style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
        >
          {t('completion.enter')}
        </Text>
        <MaterialIcons
          name="arrow-forward"
          size={20}
          color={iconColors.white}
        />
      </Pressable>
    </View>
  )
}
