import { Array as Arr, Option, pipe } from 'effect'
import { useTranslation } from 'react-i18next'
import { Pressable, Text, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { EmptyState } from '@/components/EmptyState'
import { SelectablePlantRow } from '@/components/SelectablePlantRow'
import { PlantSelectorSkeleton } from '@/components/skeletons'
import { useDelayedLoading } from '@/hooks/useDelayedLoading'
import { usePlants } from '@/hooks/usePlants'

interface PlantSelectorProps {
  selectedPlantIds: ReadonlyArray<string>
  onTogglePlant: (plantId: string) => void
  onSelectAll: () => void
  onDeselectAll: () => void
}

export function PlantSelector({
  selectedPlantIds,
  onTogglePlant,
  onSelectAll,
  onDeselectAll,
}: PlantSelectorProps) {
  const { t } = useTranslation('delegations')
  const { data: plantsData, isLoading } = usePlants({ limit: '100' })

  const isInitialLoading = isLoading && !plantsData
  const showSkeleton = useDelayedLoading(isInitialLoading)

  const plants = [
    ...pipe(
      Option.fromNullishOr(plantsData?.items),
      Option.getOrElse(
        () => [] as Array<{ id: string; name: string; imageUrl: string | null }>
      )
    ),
  ]

  const allSelected =
    Arr.isArrayNonEmpty(plants) && plants.length === selectedPlantIds.length

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
          {t('plants.selectCount', {
            selected: selectedPlantIds.length,
            total: plants.length,
          })}
        </Text>
        <Pressable
          onPress={allSelected ? onDeselectAll : onSelectAll}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text className="text-sm text-primary font-medium">
            {allSelected ? t('plants.deselectAll') : t('plants.selectAll')}
          </Text>
        </Pressable>
      </View>

      {Arr.isArrayEmpty(plants) ? (
        <EmptyState kind="delegationPickPlants" variant="inline" />
      ) : (
        <Animated.View entering={FadeIn.duration(300)} className="gap-2">
          {Arr.map(plants, (plant) => (
            <SelectablePlantRow
              key={plant.id}
              plant={plant}
              selected={Arr.contains(selectedPlantIds, plant.id)}
              onToggle={onTogglePlant}
            />
          ))}
        </Animated.View>
      )}
    </View>
  )
}
