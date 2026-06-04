import { useTranslation } from 'react-i18next'
import { Text, View } from 'react-native'

interface MonthGroupHeaderProps {
  label: string
  count: number
}

/**
 * Section header for a month group in the Growth Journal timeline.
 * Mirrors the date-header styling of the care-history Timeline.
 */
export function MonthGroupHeader({ label, count }: MonthGroupHeaderProps) {
  const { t } = useTranslation('plantDetail')

  return (
    <View className="flex-row items-baseline justify-between mb-4">
      <Text className="text-xl font-bold text-text-primary dark:text-white">
        {label}
      </Text>
      <Text className="text-sm font-medium text-text-muted dark:text-slate-400">
        {t('gallery.photoCountBadge', { count })}
      </Text>
    </View>
  )
}
