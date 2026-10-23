import { MaterialIcons } from '@expo/vector-icons'
import type { Plant } from '@lily/shared'
import { Array, Option, pipe } from 'effect'
import { Pressable, Text, View } from 'react-native'
import { AnimatedImage } from '@/components/AnimatedImage'
import { EmptyState } from '@/components/EmptyState'
import { useIconColors } from '@/hooks/useIconColors'

interface PlantSelectorProps {
  plants: readonly Plant[]
  /** False when the user owns no plant at all, not merely none left to assign. */
  hasPlants: boolean
  selectedIds: Set<string>
  onToggle: (id: string) => void
}

export function PlantSelector({
  plants,
  hasPlants,
  selectedIds,
  onToggle,
}: PlantSelectorProps) {
  const iconColors = useIconColors()

  if (Array.isReadonlyArrayEmpty(plants)) {
    return (
      <EmptyState
        kind={hasPlants ? 'roomsAllAssigned' : 'plantsNone'}
        variant="inline"
      />
    )
  }

  return (
    <View className="gap-1">
      {Array.map(plants, (plant) => {
        const isSelected = selectedIds.has(plant.id)
        const imageUri = pipe(
          Option.fromNullishOr(plant.imageUrl),
          Option.getOrUndefined
        )

        return (
          <Pressable
            key={plant.id}
            onPress={() => onToggle(plant.id)}
            className="flex-row items-center p-3 rounded-xl active:opacity-80"
          >
            <AnimatedImage
              source={{ uri: imageUri }}
              className="w-8 h-8 bg-border"
              rounded
            />
            <View className="flex-1 ml-3">
              <Text
                className="text-sm font-medium text-text-primary dark:text-white"
                numberOfLines={1}
              >
                {plant.name}
              </Text>
              {plant.category && (
                <Text
                  className="text-xs text-text-muted dark:text-slate-400"
                  numberOfLines={1}
                >
                  {plant.category}
                </Text>
              )}
            </View>
            <MaterialIcons
              name={isSelected ? 'check-circle' : 'radio-button-unchecked'}
              size={24}
              color={isSelected ? iconColors.primary : iconColors.border}
            />
          </Pressable>
        )
      })}
    </View>
  )
}
