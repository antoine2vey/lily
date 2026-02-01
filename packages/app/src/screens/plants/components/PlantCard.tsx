import { MaterialIcons } from '@expo/vector-icons'
import { Array, Match, pipe } from 'effect'
import { Image, Pressable, Text, View } from 'react-native'
import { useIconColors } from 'src/hooks/useIconColors'

type HealthStatus = 'healthy' | 'attention' | 'critical'

interface CareStatus {
  daysUntil?: number
  isOverdue: boolean
}

interface PlantCardProps {
  plant: {
    id: string
    name: string
    imageUrl?: string
    health: HealthStatus
    watering: CareStatus
    fertilization: CareStatus
    isFavorite?: boolean
  }
  onPress: (plantId: string) => void
}

const getHealthDotClass = (health: HealthStatus): string =>
  pipe(
    Match.value(health),
    Match.when('healthy', () => 'bg-primary'),
    Match.when('attention', () => 'bg-orange-400'),
    Match.when('critical', () => 'bg-red-400'),
    Match.exhaustive
  )

type CareType = 'water' | 'fertilize'

interface CareIndicator {
  type: CareType
  text: string
  isUrgent: boolean
  icon: 'water-drop' | 'spa'
}

const formatDays = (days: number): string => {
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  return `${days} days`
}

const getCareIndicator = (
  care: CareStatus,
  type: CareType
): CareIndicator | null => {
  if (care.daysUntil === undefined) return null

  const icon = type === 'water' ? 'water-drop' : 'spa'

  if (care.isOverdue) {
    return { type, text: 'Overdue', isUrgent: true, icon }
  }

  return {
    type,
    text: formatDays(care.daysUntil),
    isUrgent: care.daysUntil === 0,
    icon,
  }
}

const getCareIndicators = (
  watering: CareStatus,
  fertilization: CareStatus
): ReadonlyArray<CareIndicator> => {
  const waterIndicator = getCareIndicator(watering, 'water')
  const fertilizeIndicator = getCareIndicator(fertilization, 'fertilize')

  // Collect all indicators
  const all: CareIndicator[] = []
  if (waterIndicator) all.push(waterIndicator)
  if (fertilizeIndicator) all.push(fertilizeIndicator)

  if (all.length === 0) return []

  // If both are overdue, show both
  const overdue = Array.filter(all, (i) => i.text === 'Overdue')
  if (overdue.length === 2) return overdue

  // If one is overdue, show only that one
  if (overdue.length === 1) return overdue

  // If both are due today, show both
  const dueToday = Array.filter(all, (i) => i.text === 'Today')
  if (dueToday.length === 2) return dueToday

  // If one is due today, show only that one
  if (dueToday.length === 1) return dueToday

  // Neither is overdue or due today - show the one that's soonest
  const waterDays = watering.daysUntil ?? 999
  const fertilizeDays = fertilization.daysUntil ?? 999

  if (waterDays <= fertilizeDays && waterIndicator) {
    return [waterIndicator]
  }
  if (fertilizeIndicator) {
    return [fertilizeIndicator]
  }
  if (waterIndicator) {
    return [waterIndicator]
  }

  return []
}

export function PlantCard({ plant, onPress }: PlantCardProps) {
  const iconColors = useIconColors()
  const healthDotClass = getHealthDotClass(plant.health)
  const indicators = getCareIndicators(plant.watering, plant.fertilization)

  return (
    <Pressable
      testID={`plant-card-${plant.id}`}
      onPress={() => onPress(plant.id)}
      className="flex flex-col gap-3 p-3 bg-white dark:bg-surface-dark rounded-xl shadow-soft"
    >
      {/* Image Container */}
      <View className="relative w-full aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-slate-700">
        {/* Favorite indicator */}
        {plant.isFavorite && (
          <View
            testID="favorite-indicator"
            className="absolute top-2 left-2 z-10"
          >
            <MaterialIcons name="favorite" size={18} color={iconColors.coral} />
          </View>
        )}
        {/* Health indicator dot */}
        <View
          testID="health-dot"
          className={`absolute top-2 right-2 z-10 w-3 h-3 rounded-full ${healthDotClass} ring-2 ring-white shadow-sm`}
        />
        {plant.imageUrl ? (
          <Image
            source={{ uri: plant.imageUrl }}
            className="w-full h-full"
            resizeMode="cover"
            testID="plant-image"
          />
        ) : (
          <View
            testID="plant-placeholder"
            className="flex-1 items-center justify-center"
          >
            <MaterialIcons
              name="local-florist"
              size={48}
              color={iconColors.primary}
            />
          </View>
        )}
      </View>

      {/* Content */}
      <View>
        <Text
          numberOfLines={2}
          className="text-text-primary dark:text-white text-base font-bold leading-tight mb-1"
        >
          {plant.name}
        </Text>
        {indicators.length > 0 && (
          <View className="flex-row items-center gap-3">
            {Array.map(indicators, (indicator) => (
              <View
                key={indicator.type}
                className="flex-row items-center gap-1"
              >
                <MaterialIcons
                  name={indicator.icon}
                  size={14}
                  color={
                    indicator.isUrgent ? iconColors.warning : iconColors.primary
                  }
                />
                <Text
                  className={`text-xs font-semibold ${
                    indicator.isUrgent ? 'text-orange-500' : 'text-primary'
                  }`}
                >
                  {indicator.text}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </Pressable>
  )
}
