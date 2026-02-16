import { MaterialIcons } from '@expo/vector-icons'
import type { PublicPlantPreview } from '@lily/shared'
import { Array, Option, pipe } from 'effect'
import { Image, Text, useWindowDimensions, View } from 'react-native'
import { useIconColors } from 'src/hooks/useIconColors'

interface PlantGridProps {
  readonly plants: readonly PublicPlantPreview[]
}

export function PlantGrid({ plants }: PlantGridProps) {
  const { width } = useWindowDimensions()
  const iconColors = useIconColors()
  const padding = 16
  const gap = 8
  const columns = 3
  const cellSize = (width - padding * 2 - gap * (columns - 1)) / columns

  if (Array.isEmptyArray(plants)) return null

  return (
    <View className="px-4">
      <Text
        className="text-[11px] text-text-muted dark:text-slate-400 uppercase tracking-wide mb-3"
        style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
      >
        Recent plants
      </Text>
      <View className="flex-row flex-wrap" style={{ gap }}>
        {Array.map(plants, (plant) => (
          <View key={plant.id} style={{ width: cellSize }}>
            <View
              className="rounded-xl overflow-hidden bg-surface dark:bg-surface-dark border border-border/30 dark:border-slate-700/30"
              style={{ width: cellSize, height: cellSize }}
            >
              {pipe(
                Option.fromNullable(plant.imageUrl),
                Option.match({
                  onNone: () => (
                    <View className="flex-1 items-center justify-center bg-primary-tint dark:bg-primary/10">
                      <MaterialIcons
                        name="eco"
                        size={28}
                        color={iconColors.primary}
                      />
                    </View>
                  ),
                  onSome: (url) => (
                    <Image
                      source={{ uri: url }}
                      className="flex-1"
                      resizeMode="cover"
                    />
                  ),
                })
              )}
            </View>
            <Text
              className="text-[11px] text-text-secondary dark:text-slate-400 text-center mt-1.5 mb-1"
              numberOfLines={1}
              style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
            >
              {plant.name}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}
