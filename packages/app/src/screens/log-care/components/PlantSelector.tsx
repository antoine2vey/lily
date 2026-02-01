import { MaterialIcons } from '@expo/vector-icons'
import { Array, pipe } from 'effect'
import { useState } from 'react'
import { Image, Pressable, ScrollView, Text, View } from 'react-native'
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
  label = 'Select Plant',
  initialPlants,
}: PlantSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const { data: plantsData } = usePlants()
  const iconColors = useIconColors()
  const loadedPlants = plantsData?.items ?? []

  // Merge initialPlants with loaded plants, deduplicating by id
  const plants = pipe(
    [...(initialPlants ?? []), ...loadedPlants],
    Array.dedupeWith((a, b) => a.id === b.id)
  )

  const selectedPlants = pipe(
    plants,
    Array.filter((plant) => selectedIds.includes(plant.id))
  )

  const togglePlant = (plantId: string) => {
    if (selectedIds.includes(plantId)) {
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

  const displayText =
    selectedPlants.length === 0
      ? 'Select a plant'
      : selectedPlants.length === 1
        ? selectedPlants[0].name
        : `${selectedPlants.length} plants selected`

  return (
    <>
      <View className="mb-6">
        {label && (
          <Text className="text-sm mb-2 font-bold text-text-muted dark:text-slate-400 ml-1">
            {label}
          </Text>
        )}
        <Pressable
          onPress={() => setIsOpen(true)}
          className="relative flex-row items-center h-14 rounded-full bg-surface-tinted dark:bg-slate-800 active:opacity-90"
        >
          {/* Plant image(s) on left - stacked when multiple */}
          <View className="absolute left-1.5 top-1.5 bottom-1.5 flex-row">
            {selectedPlants.length === 0 ? (
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
                    <Image
                      source={{ uri: plant.imageUrl ?? undefined }}
                      className="w-full h-full"
                      resizeMode="cover"
                    />
                  </View>
                ))
              )
            )}
          </View>

          {/* Plant name */}
          <Text
            className={`flex-1 text-base font-bold pr-10 ${
              selectedPlants.length > 0
                ? 'text-text-primary dark:text-white'
                : 'text-text-muted dark:text-slate-400'
            }`}
            style={{
              paddingLeft:
                selectedPlants.length <= 1
                  ? 56
                  : 56 + Math.min(selectedPlants.length - 1, 2) * 24,
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
        title="Select Plants"
        snapPoints={['70%']}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          {pipe(
            plants,
            Array.map((plant) => {
              const isSelected = selectedIds.includes(plant.id)
              return (
                <Pressable
                  key={plant.id}
                  onPress={() => togglePlant(plant.id)}
                  className="flex-row items-center py-3 border-b border-border dark:border-slate-700"
                >
                  <Image
                    source={{ uri: plant.imageUrl ?? undefined }}
                    className="w-12 h-12 rounded-full mr-3 bg-border dark:bg-slate-700"
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
