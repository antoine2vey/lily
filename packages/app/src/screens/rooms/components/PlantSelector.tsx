import { MaterialIcons } from '@expo/vector-icons'
import type { Plant } from '@lily/shared'
import { Array, Option, pipe } from 'effect'
import { useTranslation } from 'react-i18next'
import { Pressable, Text, View } from 'react-native'
import { AnimatedImage } from 'src/components/AnimatedImage'
import { useIconColors } from 'src/hooks/useIconColors'

interface PlantSelectorProps {
  plants: readonly Plant[]
  selectedIds: Set<string>
  onToggle: (id: string) => void
}

export function PlantSelector({
  plants,
  selectedIds,
  onToggle,
}: PlantSelectorProps) {
  const { t } = useTranslation('rooms')
  const iconColors = useIconColors()

  if (Array.isEmptyReadonlyArray(plants)) {
    return (
      <Text className="text-sm text-text-muted dark:text-slate-400 text-center py-4">
        {t('noUnassignedPlants')}
      </Text>
    )
  }

  return (
    <View className="gap-1">
      {Array.map(plants, (plant) => {
        const isSelected = selectedIds.has(plant.id)
        const imageUri = pipe(
          Option.fromNullable(plant.imageUrl),
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
