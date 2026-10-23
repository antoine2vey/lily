import { MaterialIcons } from '@expo/vector-icons'
import type { PublicPlantPreview } from '@lily/shared'
import { Array, Option, pipe } from 'effect'
import { useTranslation } from 'react-i18next'
import { Image, Pressable, Text, useWindowDimensions, View } from 'react-native'
import { EmptyState } from '@/components/EmptyState'
import { useIconColors } from '@/hooks/useIconColors'

interface PlantGridProps {
  readonly plants: readonly PublicPlantPreview[]
  readonly onPress?: (plant: PublicPlantPreview) => void
}

export function PlantGrid({ plants, onPress }: PlantGridProps) {
  const { width } = useWindowDimensions()
  const iconColors = useIconColors()
  const { t } = useTranslation('profile')
  const padding = 16
  const gap = 8
  const columns = 3
  const cellSize = (width - padding * 2 - gap * (columns - 1)) / columns

  return (
    <View className="px-4">
      <Text
        className="text-[11px] text-text-muted dark:text-slate-400 uppercase tracking-wide mb-3"
        style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
      >
        {t('social.recentPlants')}
      </Text>
      {Array.isReadonlyArrayEmpty(plants) ? (
        <EmptyState kind="publicProfilePlants" variant="inline" />
      ) : (
        <View className="flex-row flex-wrap" style={{ gap }}>
          {Array.map(plants, (plant) => (
            <Pressable
              key={plant.id}
              style={{ width: cellSize }}
              className="active:opacity-70"
              onPress={() => onPress?.(plant)}
            >
              <View
                className="rounded-xl overflow-hidden bg-surface dark:bg-surface-dark border border-border/30 dark:border-slate-700/30"
                style={{ width: cellSize, height: cellSize }}
              >
                {pipe(
                  Option.fromNullishOr(plant.imageUrl),
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
            </Pressable>
          ))}
        </View>
      )}
    </View>
  )
}
