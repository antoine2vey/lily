import { MaterialIcons } from '@expo/vector-icons'
import { formatLongDate, type PlantDeathCause } from '@lily/shared'
import { DateTime, Option, pipe } from 'effect'
import { useTranslation } from 'react-i18next'
import { Text, View } from 'react-native'
import { useIconColors } from '@/hooks/useIconColors'

interface MemorialBannerProps {
  diedAt: Date
  cause: PlantDeathCause | null
  note: string | null
}

/**
 * Replaces the care schedule on a dead plant's detail screen. Purely
 * informational: no care actions exist for a plant in the cemetery.
 */
export function MemorialBanner({ diedAt, cause, note }: MemorialBannerProps) {
  const { t, i18n } = useTranslation('cemetery')
  const iconColors = useIconColors()

  const diedOn = pipe(
    DateTime.make(diedAt),
    Option.map((dt) => formatLongDate(dt, i18n.language)),
    Option.getOrElse(() => '')
  )

  return (
    <View
      className="rounded-3xl p-5 bg-surface-tinted dark:bg-slate-800 border border-border/30 dark:border-slate-700/40"
      testID="memorial-banner"
    >
      <View className="flex-row items-center gap-3">
        <View className="w-10 h-10 rounded-full items-center justify-center bg-white dark:bg-slate-700">
          <MaterialIcons
            name="local-florist"
            size={22}
            color={iconColors.textMuted}
          />
        </View>
        <View className="flex-1">
          <Text className="text-base font-bold text-text-primary dark:text-white">
            {t('banner.title')}
          </Text>
          <Text className="text-sm font-regular text-text-muted dark:text-slate-400">
            {t('diedOn', { date: diedOn })}
          </Text>
        </View>
      </View>
      {cause && (
        <Text className="mt-3 text-sm font-medium text-text-secondary dark:text-slate-300">
          {t('banner.cause', { cause: t(`causes.${cause}`) })}
        </Text>
      )}
      {note && (
        <Text className="mt-2 text-sm italic font-regular text-text-muted dark:text-slate-400">
          “{note}”
        </Text>
      )}
    </View>
  )
}
