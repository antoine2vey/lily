import { Match, pipe } from 'effect'
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

const getHealthBadgeProps = (
  health: HealthStatus
): { label: string; variant: 'success' | 'warning' | 'error' } =>
  pipe(
    Match.value(health),
    Match.when('healthy', () => ({
      label: 'HEALTHY',
      variant: 'success' as const,
    })),
    Match.when('attention', () => ({
      label: 'NEEDS ATTENTION',
      variant: 'warning' as const,
    })),
    Match.when('critical', () => ({
      label: 'CRITICAL',
      variant: 'error' as const,
    })),
    Match.exhaustive
  )

export function PlantHeader({ plant }: PlantHeaderProps) {
  const badgeProps = getHealthBadgeProps(plant.health)

  const speciesLine =
    plant.category && plant.species
      ? `${plant.category} • ${plant.species}`
      : (plant.species ?? plant.category)

  return (
    <View testID="plant-header">
      <View className="flex-row items-center justify-between">
        <Text
          className="text-[28px] flex-1 mr-3 font-bold text-text-primary"
          numberOfLines={2}
          testID="plant-name"
        >
          {plant.name}
        </Text>
        <Badge
          label={badgeProps.label}
          variant={badgeProps.variant}
          size="sm"
        />
      </View>
      {speciesLine && (
        <Text
          className="text-sm mt-1 font-regular text-primary"
          testID="plant-species"
        >
          {speciesLine}
        </Text>
      )}
    </View>
  )
}
