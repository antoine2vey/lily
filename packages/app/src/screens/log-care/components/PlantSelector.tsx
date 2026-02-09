import { MaterialIcons } from '@expo/vector-icons'
import { Array, Match, Option, pipe } from 'effect'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { AnimatedImage } from 'src/components/AnimatedImage'
import { BottomSheet } from 'src/components/BottomSheet'
import { useIconColors } from 'src/hooks/useIconColors'
import { usePlants } from 'src/hooks/usePlants'

interface Plant {
  id: string
  name: string
  imageUrl?: string | null
}

interface PlantSelectorProps {
  selectedIds: string[]
  onSelectionChange: (ids: string[]) => void
  label?: string
  initialPlants?: Plant[]
}

export function PlantSelector({
  selectedIds,
  onSelectionChange,
  label,
  initialPlants,
}: PlantSelectorProps) {
  const { t } = useTranslation('care')
  const [isOpen, setIsOpen] = useState(false)
  const { data: plantsData } = usePlants()
  const iconColors = useIconColors()
  const loadedPlants = Option.getOrElse(
    Option.fromNullable(plantsData?.items),
    () => [] as NonNullable<typeof plantsData>['items']
  )
  const displayLabel = Option.getOrElse(Option.fromNullable(label), () =>
    t('log.selectPlant')
  )

  // Merge initialPlants with loaded plants, deduplicating by id
  const plants = pipe(
    [
      ...Option.getOrElse(
        Option.fromNullable(initialPlants),
        () => [] as Plant[]
      ),
      ...loadedPlants,
    ],
    Array.dedupeWith((a, b) => a.id === b.id)
  )

  const selectedPlants = pipe(
    plants,
    Array.filter((plant) => Array.contains(selectedIds, plant.id))
  )

  const togglePlant = (plantId: string) => {
    if (Array.contains(selectedIds, plantId)) {
      onSelectionChange(
        pipe(
          selectedIds,
          Array.filter((id) => id !== plantId)
        )
      )
    } else {
      onSelectionChange([...selectedIds, plantId])
    }
  }

  const displayText = pipe(
    Match.value(Array.length(selectedPlants)),
    Match.when(0, () => t('log.selectAPlant')),
    Match.when(1, () =>
      pipe(
        Array.head(selectedPlants),
        Option.map((p) => p.name),
        Option.getOrElse(() => t('log.selectAPlant'))
      )
    ),
    Match.orElse(() =>
      t('log.plantsSelected', { count: Array.length(selectedPlants) })
    )
  )

  return (
    <>
      <View className="mb-6">
        {displayLabel && (
          <Text className="text-sm mb-2 font-bold text-text-muted dark:text-slate-400 ml-1">
            {displayLabel}
          </Text>
        )}
        <Pressable
          onPress={() => setIsOpen(true)}
          className="relative flex-row items-center h-14 rounded-full bg-surface-tinted dark:bg-slate-800 active:opacity-90"
        >
          {/* Plant image(s) on left - stacked when multiple */}
          <View className="absolute left-1.5 top-1.5 bottom-1.5 flex-row">
            {Array.isEmptyReadonlyArray(selectedPlants) ? (
              <View className="h-full aspect-square rounded-full bg-white dark:bg-surface-dark shadow-sm overflow-hidden items-center justify-center">
                <MaterialIcons
                  name="eco"
                  size={20}
                  color={iconColors.textMuted}
                />
              </View>
            ) : (
              pipe(
                selectedPlants,
                Array.take(3),
                Array.map((plant, index) => (
                  <View
                    key={plant.id}
                    className="h-full aspect-square rounded-full bg-white shadow-sm overflow-hidden border-2 border-white"
                    style={{
                      marginLeft: index > 0 ? -12 : 0,
                      zIndex: 3 - index,
                    }}
                  >
                    <AnimatedImage
                      source={{
                        uri: Option.getOrUndefined(
                          Option.fromNullable(plant.imageUrl)
                        ),
                      }}
                      className="w-full h-full"
                      rounded
                    />
                  </View>
                ))
              )
            )}
          </View>

          {/* Plant name */}
          <Text
            className={`flex-1 text-base font-bold pr-10 ${
              !Array.isEmptyReadonlyArray(selectedPlants)
                ? 'text-text-primary dark:text-white'
                : 'text-text-muted dark:text-slate-400'
            }`}
            style={{
              paddingLeft:
                Array.length(selectedPlants) <= 1
                  ? 56
                  : 56 + Math.min(Array.length(selectedPlants) - 1, 2) * 24,
            }}
            numberOfLines={1}
          >
            {displayText}
          </Text>

          {/* Expand icon on right */}
          <View className="absolute right-5 top-0 bottom-0 justify-center">
            <MaterialIcons
              name="expand-more"
              size={24}
              color={iconColors.textMuted}
            />
          </View>
        </Pressable>
      </View>

      <BottomSheet
        visible={isOpen}
        onClose={() => setIsOpen(false)}
        title={t('log.selectPlantsTitle')}
        snapPoints={['70%']}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          {pipe(
            plants,
            Array.map((plant) => {
              const isSelected = Array.contains(selectedIds, plant.id)
              return (
                <Pressable
                  key={plant.id}
                  onPress={() => togglePlant(plant.id)}
                  className="flex-row items-center py-3 border-b border-border dark:border-slate-700"
                >
                  <AnimatedImage
                    source={{
                      uri: Option.getOrUndefined(
                        Option.fromNullable(plant.imageUrl)
                      ),
                    }}
                    className="w-12 h-12 mr-3"
                    rounded
                  />
                  <Text
                    className={`flex-1 text-base text-text-primary dark:text-white ${isSelected ? 'font-bold' : 'font-regular'}`}
                  >
                    {plant.name}
                  </Text>
                  <View
                    className={`w-6 h-6 rounded-full items-center justify-center ${isSelected ? 'bg-primary' : 'border-2 border-border dark:border-slate-600'}`}
                  >
                    {isSelected && (
                      <MaterialIcons
                        name="check"
                        size={16}
                        color={iconColors.white}
                      />
                    )}
                  </View>
                </Pressable>
              )
            })
          )}
        </ScrollView>
      </BottomSheet>
    </>
  )
}
