import { MaterialIcons } from '@expo/vector-icons'
import { Array, pipe } from 'effect'
import { Image, Pressable, Text, View } from 'react-native'
import { colors, fonts } from 'src/theme'

interface Plant {
  id: string
  name: string
  imageUrl?: string
}

interface HydrationCardProps {
  plants: Plant[]
  onWaterAll: () => void
  onPlantPress: (plantId: string) => void
}

const MAX_VISIBLE_PLANTS = 3

function PlantCircle({
  plant,
  onPress,
}: {
  plant: Plant
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      className="items-center gap-2"
      accessibilityLabel={`View ${plant.name}`}
    >
      {/* Plant image with water drop badge */}
      <View className="relative">
        <View
          className="w-[72px] h-[72px] rounded-full overflow-hidden bg-white items-center justify-center"
          style={{
            borderWidth: 3,
            borderColor: 'white',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 4,
            elevation: 3,
          }}
        >
          {plant.imageUrl ? (
            <Image
              source={{ uri: plant.imageUrl }}
              className="w-full h-full"
              resizeMode="cover"
            />
          ) : (
            <View
              className="w-full h-full items-center justify-center"
              style={{ backgroundColor: colors.primaryTint }}
            >
              <MaterialIcons name="eco" size={32} color={colors.primary} />
            </View>
          )}
        </View>
        {/* Water drop badge */}
        <View
          className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full items-center justify-center"
          style={{
            backgroundColor: '#E3F2FD',
            borderWidth: 2,
            borderColor: 'white',
          }}
        >
          <MaterialIcons name="water-drop" size={14} color="#2196F3" />
        </View>
      </View>
      {/* Plant name */}
      <Text
        className="text-xs text-text-secondary"
        style={{ fontFamily: fonts.semiBold }}
        numberOfLines={1}
      >
        {plant.name}
      </Text>
    </Pressable>
  )
}

export function HydrationCard({
  plants,
  onWaterAll,
  onPlantPress,
}: HydrationCardProps) {
  if (plants.length === 0) {
    return null
  }

  const visiblePlants = pipe(plants, Array.take(MAX_VISIBLE_PLANTS))
  const remainingCount = plants.length - MAX_VISIBLE_PLANTS

  return (
    <View
      className="rounded-[32px] p-6 overflow-hidden"
      style={{
        backgroundColor: '#dceccb',
      }}
    >
      {/* Header */}
      <View className="flex-row items-start justify-between mb-6">
        <View>
          <Text
            className="text-xl text-text-primary mb-1"
            style={{ fontFamily: fonts.bold }}
          >
            Hydration Time
          </Text>
          <Text
            className="text-sm text-text-secondary"
            style={{ fontFamily: fonts.medium }}
          >
            {plants.length} plant{plants.length !== 1 ? 's' : ''}{' '}
            {plants.length === 1 ? 'needs' : 'need'} water today
          </Text>
        </View>
        {/* Water drop icon */}
        <View
          className="p-2 rounded-full"
          style={{ backgroundColor: 'rgba(255, 255, 255, 0.6)' }}
        >
          <MaterialIcons name="water-drop" size={24} color={colors.primary} />
        </View>
      </View>

      {/* Plant Circles */}
      <View className="flex-row items-start gap-5 mb-7">
        {Array.map(visiblePlants, (plant) => (
          <PlantCircle
            key={plant.id}
            plant={plant}
            onPress={() => onPlantPress(plant.id)}
          />
        ))}
        {remainingCount > 0 && (
          <View className="items-center gap-2">
            <View
              className="w-[72px] h-[72px] rounded-full items-center justify-center"
              style={{ backgroundColor: colors.primaryTint }}
            >
              <Text
                className="text-base"
                style={{ fontFamily: fonts.bold, color: colors.primary }}
              >
                +{remainingCount}
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* Water All Button */}
      <Pressable
        onPress={onWaterAll}
        className="h-12 rounded-full flex-row items-center justify-center gap-2"
        style={{
          backgroundColor: colors.primary,
          shadowColor: colors.primary,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.25,
          shadowRadius: 8,
          elevation: 4,
        }}
        accessibilityLabel="Water all plants"
        accessibilityRole="button"
      >
        <MaterialIcons name="check-circle" size={20} color={colors.white} />
        <Text
          className="text-[15px] text-white"
          style={{ fontFamily: fonts.bold }}
        >
          Water All
        </Text>
      </Pressable>
    </View>
  )
}
