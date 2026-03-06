import { MaterialIcons } from '@expo/vector-icons'
import type { LuminosityLevel } from '@lily/shared'
import { String } from 'effect'
import { useTranslation } from 'react-i18next'
import { Text, View } from 'react-native'
import { SectionHeader } from 'src/components/SectionHeader'
import { useIconColors } from 'src/hooks/useIconColors'

type WaterLevel = 'low' | 'moderate' | 'high'
type HumidityLevel = 'low' | 'moderate' | 'high' | 'tropical'

interface IdealEnvironmentProps {
  sunlightRating: LuminosityLevel
  sunlightPercentage: number
  water: WaterLevel
  humidity: HumidityLevel
}

const WATER_PERCENTAGES: Record<WaterLevel, number> = {
  low: 30,
  moderate: 50,
  high: 80,
}

const HUMIDITY_PERCENTAGES: Record<HumidityLevel, number> = {
  low: 25,
  moderate: 50,
  high: 75,
  tropical: 90,
}

interface EnvironmentRowProps {
  icon: keyof typeof MaterialIcons.glyphMap
  iconBgColor: string
  iconColor: string
  label: string
  value: string
  badgeBgColor: string
  badgeTextColor: string
  barColor: string
  percentage: number
}

function EnvironmentRow({
  icon,
  iconBgColor,
  iconColor,
  label,
  value,
  badgeBgColor,
  badgeTextColor,
  barColor,
  percentage,
}: EnvironmentRowProps) {
  return (
    <View
      className="flex-row items-center gap-4"
      testID={`environment-row-${String.toLowerCase(label)}`}
    >
      <View
        className="w-10 h-10 rounded-full items-center justify-center"
        style={{ backgroundColor: iconBgColor }}
      >
        <MaterialIcons name={icon} size={20} color={iconColor} />
      </View>
      <View className="flex-1">
        <View className="flex-row justify-between mb-2">
          <Text className="text-sm font-bold text-text-primary dark:text-white">
            {label}
          </Text>
          <View
            className="px-2 py-0.5 rounded-md"
            style={{ backgroundColor: badgeBgColor }}
          >
            <Text
              className="text-xs font-semibold"
              style={{ color: badgeTextColor }}
            >
              {value}
            </Text>
          </View>
        </View>
        <View className="h-2.5 w-full rounded-full overflow-hidden bg-surface-tinted dark:bg-slate-700">
          <View
            className="h-full rounded-full"
            style={{ width: `${percentage}%`, backgroundColor: barColor }}
          />
        </View>
      </View>
    </View>
  )
}

export function IdealEnvironment({
  sunlightRating,
  sunlightPercentage,
  water,
  humidity,
}: IdealEnvironmentProps) {
  const { t } = useTranslation('plants')
  const iconColors = useIconColors()
  const isDark = iconColors.isDark

  // Unified color scheme using primary green
  const rowColors = {
    iconBgColor: isDark ? 'rgba(91, 140, 90, 0.2)' : 'rgba(91, 140, 90, 0.1)',
    iconColor: isDark ? '#6B9C6A' : '#5B8C5A',
    barColor: isDark ? '#6B9C6A' : '#5B8C5A',
    badgeBgColor: isDark ? 'rgba(91, 140, 90, 0.2)' : 'rgba(91, 140, 90, 0.1)',
    badgeTextColor: isDark ? '#6B9C6A' : '#5B8C5A',
  }

  return (
    <View testID="ideal-environment">
      <SectionHeader title={t('detail.idealEnvironment')} />
      <View className="mt-4 bg-surface dark:bg-surface-dark p-6 rounded-3xl shadow-sm border border-border/30 dark:border-slate-700/30 gap-6">
        <EnvironmentRow
          icon="wb-sunny"
          iconBgColor={rowColors.iconBgColor}
          iconColor={rowColors.iconColor}
          label={t('detail.sunlight')}
          value={t(`detail.sunlightLevels.${sunlightRating}`)}
          badgeBgColor={rowColors.badgeBgColor}
          badgeTextColor={rowColors.badgeTextColor}
          barColor={rowColors.barColor}
          percentage={sunlightPercentage}
        />
        <EnvironmentRow
          icon="water-drop"
          iconBgColor={rowColors.iconBgColor}
          iconColor={rowColors.iconColor}
          label={t('detail.water')}
          value={t(`detail.waterLevels.${water}`)}
          badgeBgColor={rowColors.badgeBgColor}
          badgeTextColor={rowColors.badgeTextColor}
          barColor={rowColors.barColor}
          percentage={WATER_PERCENTAGES[water]}
        />
        <EnvironmentRow
          icon="cloud"
          iconBgColor={rowColors.iconBgColor}
          iconColor={rowColors.iconColor}
          label={t('detail.humidity')}
          value={t(`detail.humidityLevels.${humidity}`)}
          badgeBgColor={rowColors.badgeBgColor}
          badgeTextColor={rowColors.badgeTextColor}
          barColor={rowColors.barColor}
          percentage={HUMIDITY_PERCENTAGES[humidity]}
        />
      </View>
    </View>
  )
}
