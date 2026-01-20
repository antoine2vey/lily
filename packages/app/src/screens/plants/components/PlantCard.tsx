import { MaterialIcons } from '@expo/vector-icons'
import { Match, Option, pipe } from 'effect'
import { Image, Pressable, Text, View } from 'react-native'

type HealthStatus = 'healthy' | 'attention' | 'critical'

interface PlantCardProps {
  plant: {
    id: string
    name: string
    imageUrl?: string
    health: HealthStatus
    daysUntilWater?: number
    needsWater?: boolean
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

interface WaterIndicator {
  text: string
  isUrgent: boolean
}

const getWaterIndicator = (
  daysUntilWater: number | undefined,
  needsWater: boolean | undefined
): Option.Option<WaterIndicator> => {
  if (needsWater) {
    return Option.some({ text: 'Overdue', isUrgent: true })
  }
  if (daysUntilWater === undefined) {
    return Option.none()
  }
  if (daysUntilWater === 0) {
    return Option.some({ text: 'Today', isUrgent: true })
  }
  if (daysUntilWater === 1) {
    return Option.some({ text: 'Tomorrow', isUrgent: false })
  }
  return Option.some({ text: `${daysUntilWater} days`, isUrgent: false })
}

export function PlantCard({ plant, onPress }: PlantCardProps) {
  const healthDotClass = getHealthDotClass(plant.health)
  const waterIndicator = getWaterIndicator(
    plant.daysUntilWater,
    plant.needsWater
  )

  return (
    <Pressable
      testID={`plant-card-${plant.id}`}
      onPress={() => onPress(plant.id)}
      className="flex flex-col gap-3 p-3 bg-white rounded-xl shadow-soft"
    >
      {/* Image Container */}
      <View className="relative w-full aspect-square rounded-lg overflow-hidden bg-gray-100">
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
            <MaterialIcons name="local-florist" size={48} color="#5B8C5A" />
          </View>
        )}
      </View>

      {/* Content */}
      <View>
        <Text
          numberOfLines={2}
          className="text-[#141712] text-base font-bold leading-tight mb-1"
        >
          {plant.name}
        </Text>
        {Option.isSome(waterIndicator) && (
          <View className="flex-row items-center gap-1.5">
            <MaterialIcons
              name="water-drop"
              size={16}
              color={waterIndicator.value.isUrgent ? '#f97316' : '#5B8C5A'}
            />
            <Text
              className={`text-xs font-semibold ${
                waterIndicator.value.isUrgent
                  ? 'text-orange-500'
                  : 'text-primary'
              }`}
            >
              {waterIndicator.value.text}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  )
}
