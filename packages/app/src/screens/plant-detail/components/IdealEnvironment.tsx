import { MaterialIcons } from '@expo/vector-icons'
import { Text, View } from 'react-native'
import { SectionHeader } from 'src/components/SectionHeader'
import { useIconColors } from 'src/hooks/useIconColors'

type SunlightLevel = 'low' | 'indirect' | 'bright' | 'direct'
type WaterLevel = 'low' | 'moderate' | 'high'
type HumidityLevel = 'low' | 'moderate' | 'high' | 'tropical'

interface IdealEnvironmentProps {
  sunlight: SunlightLevel
  water: WaterLevel
  humidity: HumidityLevel
}

const SUNLIGHT_LABELS: Record<SunlightLevel, string> = {
  low: 'Low Light',
  indirect: 'Indirect Bright',
  bright: 'Bright Light',
  direct: 'Direct Sun',
}

const SUNLIGHT_PERCENTAGES: Record<SunlightLevel, number> = {
  low: 25,
  indirect: 50,
  bright: 75,
  direct: 100,
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

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

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
      testID={`environment-row-${label.toLowerCase()}`}
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
  sunlight,
  water,
  humidity,
}: IdealEnvironmentProps) {
  const iconColors = useIconColors()
  const isDark = iconColors.isDark

  // Theme-aware colors for environment metrics
  const sunlightColors = {
    iconBgColor: isDark ? 'rgba(251, 191, 36, 0.2)' : 'rgba(251, 191, 36, 0.1)',
    iconColor: isDark ? '#FBBF24' : '#FB923C',
    barColor: isDark ? '#FBBF24' : '#FB923C',
    badgeBgColor: isDark
      ? 'rgba(155, 199, 109, 0.2)'
      : 'rgba(91, 140, 90, 0.1)',
    badgeTextColor: isDark ? '#9bc76d' : '#5B8C5A',
  }

  const waterColors = {
    iconBgColor: isDark ? 'rgba(96, 165, 250, 0.2)' : 'rgba(96, 165, 250, 0.1)',
    iconColor: isDark ? '#93C5FD' : '#60A5FA',
    barColor: isDark ? '#93C5FD' : '#60A5FA',
    badgeBgColor: isDark
      ? 'rgba(96, 165, 250, 0.2)'
      : 'rgba(96, 165, 250, 0.1)',
    badgeTextColor: isDark ? '#93C5FD' : '#3B82F6',
  }

  const humidityColors = {
    iconBgColor: isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(45, 212, 191, 0.1)',
    iconColor: isDark ? '#5EEAD4' : '#2DD4BF',
    barColor: isDark ? '#5EEAD4' : '#2DD4BF',
    badgeBgColor: isDark
      ? 'rgba(45, 212, 191, 0.2)'
      : 'rgba(45, 212, 191, 0.1)',
    badgeTextColor: isDark ? '#5EEAD4' : '#14B8A6',
  }

  return (
    <View testID="ideal-environment">
      <SectionHeader title="Ideal Environment" />
      <View className="mt-4 bg-surface dark:bg-surface-dark p-6 rounded-3xl shadow-sm border border-border/30 dark:border-slate-700/30 gap-6">
        <EnvironmentRow
          icon="wb-sunny"
          iconBgColor={sunlightColors.iconBgColor}
          iconColor={sunlightColors.iconColor}
          label="Sunlight"
          value={SUNLIGHT_LABELS[sunlight]}
          badgeBgColor={sunlightColors.badgeBgColor}
          badgeTextColor={sunlightColors.badgeTextColor}
          barColor={sunlightColors.barColor}
          percentage={SUNLIGHT_PERCENTAGES[sunlight]}
        />
        <EnvironmentRow
          icon="water-drop"
          iconBgColor={waterColors.iconBgColor}
          iconColor={waterColors.iconColor}
          label="Water"
          value={capitalize(water)}
          badgeBgColor={waterColors.badgeBgColor}
          badgeTextColor={waterColors.badgeTextColor}
          barColor={waterColors.barColor}
          percentage={WATER_PERCENTAGES[water]}
        />
        <EnvironmentRow
          icon="cloud"
          iconBgColor={humidityColors.iconBgColor}
          iconColor={humidityColors.iconColor}
          label="Humidity"
          value={capitalize(humidity)}
          badgeBgColor={humidityColors.badgeBgColor}
          badgeTextColor={humidityColors.badgeTextColor}
          barColor={humidityColors.barColor}
          percentage={HUMIDITY_PERCENTAGES[humidity]}
        />
      </View>
    </View>
  )
}
