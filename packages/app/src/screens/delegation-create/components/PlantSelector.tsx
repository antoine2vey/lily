import { MaterialIcons } from '@expo/vector-icons'
import { Array as Arr, Option, pipe } from 'effect'
import { Pressable, Text, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { Avatar } from 'src/components/Avatar'
import { SkeletonBox, SkeletonCircle } from 'src/components/skeletons'
import { useDelayedLoading } from 'src/hooks/useDelayedLoading'
import { useIconColors } from 'src/hooks/useIconColors'
import { usePlants } from 'src/hooks/usePlants'

interface PlantSelectorProps {
  selectedPlantIds: ReadonlyArray<string>
  onTogglePlant: (plantId: string) => void
  onSelectAll: () => void
  onDeselectAll: () => void
}

function PlantSelectorSkeleton() {
  return (
    <View className="gap-2">
      <SkeletonBox width="30%" height={14} rounded="sm" />
      <View className="gap-2 mt-2">
        {Arr.map([1, 2, 3], (i) => (
          <View
            key={i}
            className="flex-row items-center p-3 rounded-xl bg-surface dark:bg-surface-dark"
          >
            <SkeletonCircle size={36} />
            <View className="flex-1 ml-3">
              <SkeletonBox width="50%" height={14} rounded="sm" />
            </View>
            <SkeletonBox width={24} height={24} rounded="sm" />
          </View>
        ))}
      </View>
    </View>
  )
}

export function PlantSelector({
  selectedPlantIds,
  onTogglePlant,
  onSelectAll,
  onDeselectAll,
}: PlantSelectorProps) {
  const iconColors = useIconColors()
  const { data: plantsData, isLoading } = usePlants({ limit: '100' })

  const isInitialLoading = isLoading && !plantsData
  const showSkeleton = useDelayedLoading(isInitialLoading)

  const plants = [
    ...pipe(
      Option.fromNullable(plantsData?.items),
      Option.getOrElse(
        () => [] as Array<{ id: string; name: string; imageUrl: string | null }>
      )
    ),
  ]

  const allSelected =
    Arr.isNonEmptyArray(plants) && plants.length === selectedPlantIds.length

  if (showSkeleton) {
    return (
      <Animated.View entering={FadeIn.duration(300)}>
        <PlantSelectorSkeleton />
      </Animated.View>
    )
  }

  if (isInitialLoading) return null

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between ml-1">
        <Text
          className="text-sm font-semibold text-text-secondary dark:text-slate-300"
          style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
        >
          Plants ({selectedPlantIds.length}/{plants.length})
        </Text>
        <Pressable
          onPress={allSelected ? onDeselectAll : onSelectAll}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text className="text-sm text-primary font-medium">
            {allSelected ? 'Deselect All' : 'Select All'}
          </Text>
        </Pressable>
      </View>

      {Arr.isEmptyArray(plants) ? (
        <View className="p-6 items-center rounded-2xl bg-surface dark:bg-surface-dark">
          <MaterialIcons name="eco" size={32} color={iconColors.textMuted} />
          <Text className="text-sm mt-2 text-text-muted dark:text-slate-400">
            No plants to delegate
          </Text>
        </View>
      ) : (
        <Animated.View entering={FadeIn.duration(300)} className="gap-2">
          {Arr.map(plants, (plant) => {
            const isSelected = Arr.contains(selectedPlantIds, plant.id)

            return (
              <Pressable
                key={plant.id}
                onPress={() => onTogglePlant(plant.id)}
                className={`flex-row items-center p-3 rounded-xl border-2 ${
                  isSelected
                    ? 'border-primary/50 bg-primary-tint dark:bg-primary/10'
                    : 'border-transparent bg-surface dark:bg-surface-dark'
                }`}
              >
                <Avatar
                  source={pipe(
                    Option.fromNullable(plant.imageUrl),
                    Option.map((uri) => ({ uri })),
                    Option.getOrUndefined
                  )}
                  name={plant.name}
                  size="sm"
                />
                <Text
                  className="flex-1 ml-3 text-sm font-medium text-text-primary dark:text-white"
                  numberOfLines={1}
                >
                  {plant.name}
                </Text>
                <View
                  className={`w-6 h-6 rounded-md items-center justify-center ${
                    isSelected
                      ? 'bg-primary'
                      : 'border-2 border-border dark:border-slate-600'
                  }`}
                >
                  {isSelected && (
                    <MaterialIcons name="check" size={16} color="white" />
                  )}
                </View>
              </Pressable>
            )
          })}
        </Animated.View>
      )}
    </View>
  )
}
