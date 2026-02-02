import { Match, pipe } from 'effect'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { Text, View } from 'react-native'
import { Badge } from 'src/components/Badge'

type HealthStatus = 'healthy' | 'attention' | 'critical'

interface PlantHeaderProps {
  plant: {
    name: string
    species?: string
    category?: string
    health: HealthStatus
  }
}

interface HealthBadgeConfig {
  labelKey: 'healthy' | 'attention' | 'critical'
  variant: 'success' | 'warning' | 'error'
}

const getHealthBadgeConfig = (health: HealthStatus): HealthBadgeConfig =>
  pipe(
    Match.value(health),
    Match.when('healthy', () => ({
      labelKey: 'healthy' as const,
      variant: 'success' as const,
    })),
    Match.when('attention', () => ({
      labelKey: 'attention' as const,
      variant: 'warning' as const,
    })),
    Match.when('critical', () => ({
      labelKey: 'critical' as const,
      variant: 'error' as const,
    })),
    Match.exhaustive
  )

const getHealthBadgeLabel = (
  labelKey: HealthBadgeConfig['labelKey'],
  t: TFunction
): string => t(`healthBadge.${labelKey}`)

export function PlantHeader({ plant }: PlantHeaderProps) {
  const { t } = useTranslation('plants')
  const badgeConfig = getHealthBadgeConfig(plant.health)

  const speciesLine =
    plant.category && plant.species
      ? `${plant.category} • ${plant.species}`
      : (plant.species ?? plant.category)

  return (
    <View testID="plant-header">
      <View className="flex-row items-center justify-between">
        <Text
          className="text-[28px] flex-1 mr-3 font-bold text-text-primary dark:text-white"
          numberOfLines={2}
          testID="plant-name"
        >
          {plant.name}
        </Text>
        <Badge
          label={getHealthBadgeLabel(badgeConfig.labelKey, t)}
          variant={badgeConfig.variant}
          size="sm"
        />
      </View>
      {speciesLine && (
        <Text
          className="text-sm mt-1 font-regular text-primary dark:text-primary-light"
          testID="plant-species"
        >
          {speciesLine}
        </Text>
      )}
    </View>
  )
}
