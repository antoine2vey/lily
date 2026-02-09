import { MaterialIcons } from '@expo/vector-icons'
import { Array, pipe } from 'effect'
import { LinearGradient } from 'expo-linear-gradient'
import { useTranslation } from 'react-i18next'
import { Pressable, Text, View } from 'react-native'
import { AnimatedImage } from 'src/components/AnimatedImage'
import { useIconColors } from 'src/hooks/useIconColors'

interface Plant {
  id: string
  name: string
  imageUrl?: string
}

interface HydrationCardProps {
  plants: ReadonlyArray<Plant>
  onWaterAll: () => void
  onPlantPress: (plantId: string) => void
  isLoading?: boolean
}

const MAX_VISIBLE_PLANTS = 3

interface PlantCircleProps {
  plant: Plant
  onPress: () => void
  iconColors: ReturnType<typeof useIconColors>
}

function PlantCircle({ plant, onPress, iconColors }: PlantCircleProps) {
  const { t } = useTranslation('home')
  const isDark = iconColors.isDark

  return (
    <Pressable
      onPress={onPress}
      className="items-center gap-2"
      accessibilityLabel={t('hydration.viewPlant', { name: plant.name })}
    >
      {/* Plant image with water drop badge */}
      <View className="relative">
        <View
          className="w-[72px] h-[72px] rounded-full overflow-hidden items-center justify-center"
          style={{
            backgroundColor: isDark ? '#374151' : '#FFFFFF',
            borderWidth: 3,
            borderColor: isDark ? '#4B5563' : 'white',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: isDark ? 0.3 : 0.1,
            shadowRadius: 4,
            elevation: 3,
          }}
        >
          {plant.imageUrl ? (
            <AnimatedImage
              source={{ uri: plant.imageUrl }}
              className="w-full h-full"
              rounded
              fallback={
                <View
                  className="w-full h-full items-center justify-center"
                  style={{
                    backgroundColor: isDark ? '#2D3728' : '#E8F5E8',
                  }}
                >
                  <MaterialIcons
                    name="eco"
                    size={32}
                    color={iconColors.primary}
                  />
                </View>
              }
            />
          ) : (
            <View
              className="w-full h-full items-center justify-center"
              style={{ backgroundColor: isDark ? '#2D3728' : '#E8F5E8' }}
            >
              <MaterialIcons name="eco" size={32} color={iconColors.primary} />
            </View>
          )}
        </View>
        {/* Water drop badge */}
        <View
          className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full items-center justify-center"
          style={{
            backgroundColor: isDark ? 'rgba(96, 165, 250, 0.2)' : '#E3F2FD',
            borderWidth: 2,
            borderColor: isDark ? '#4B5563' : 'white',
          }}
        >
          <MaterialIcons
            name="water-drop"
            size={14}
            color={iconColors.waterBlue}
          />
        </View>
      </View>
      {/* Plant name */}
      <Text
        className="text-xs font-semibold"
        style={{ color: isDark ? '#D1D5DB' : '#374151' }}
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
  isLoading = false,
}: HydrationCardProps) {
  const { t } = useTranslation('home')
  const iconColors = useIconColors()
  const isDark = iconColors.isDark

  if (Array.isEmptyReadonlyArray(plants)) {
    return null
  }

  const visiblePlants = pipe(plants, Array.take(MAX_VISIBLE_PLANTS))
  const remainingCount = Array.length(plants) - MAX_VISIBLE_PLANTS

  // Theme-aware gradient colors
  const gradientColors: [string, string, string] = isDark
    ? ['#1E2A1A', '#243320', '#2D3728']
    : ['#dceccb', '#eaf6df', '#ffffff']

  return (
    <LinearGradient
      colors={gradientColors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        borderRadius: 32,
        padding: 24,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: isDark ? 0.3 : 0.06,
        shadowRadius: 20,
        elevation: 4,
      }}
    >
      {/* Header */}
      <View className="flex-row items-start justify-between mb-6">
        <View>
          <Text
            className="text-xl mb-1 font-bold"
            style={{ color: isDark ? '#FFFFFF' : '#1A1A1A' }}
          >
            {t('hydration.title')}
          </Text>
          <Text
            className="text-sm font-medium"
            style={{ color: isDark ? '#9CA3AF' : '#475569' }}
          >
            {t('hydration.plantsNeedWater', { count: Array.length(plants) })}
          </Text>
        </View>
        {/* Water drop icon */}
        <View
          className="p-2 rounded-full"
          style={{
            backgroundColor: isDark
              ? 'rgba(155, 199, 109, 0.2)'
              : 'rgba(255, 255, 255, 0.6)',
          }}
        >
          <MaterialIcons
            name="water-drop"
            size={24}
            color={iconColors.primary}
          />
        </View>
      </View>

      {/* Plant Circles */}
      <View className="flex-row items-start gap-5 mb-7">
        {Array.map(visiblePlants, (plant) => (
          <PlantCircle
            key={plant.id}
            plant={plant}
            onPress={() => onPlantPress(plant.id)}
            iconColors={iconColors}
          />
        ))}
        {remainingCount > 0 && (
          <View className="items-center gap-2">
            <View
              className="w-[72px] h-[72px] rounded-full items-center justify-center"
              style={{ backgroundColor: isDark ? '#2D3728' : '#E8F5E8' }}
            >
              <Text
                className="text-base font-bold"
                style={{ color: iconColors.primary }}
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
        disabled={isLoading}
        className={`h-12 rounded-full flex-row items-center justify-center gap-2 ${isLoading ? 'bg-primary/60' : 'bg-primary'}`}
        style={{
          shadowColor: iconColors.primary,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.25,
          shadowRadius: 8,
          elevation: 4,
        }}
        accessibilityLabel={t('hydration.waterAllPlants')}
        accessibilityRole="button"
      >
        <MaterialIcons name="check-circle" size={20} color={iconColors.white} />
        <Text className="text-[15px] text-white font-bold">
          {isLoading ? t('hydration.wateringAll') : t('hydration.waterAll')}
        </Text>
      </Pressable>
    </LinearGradient>
  )
}
