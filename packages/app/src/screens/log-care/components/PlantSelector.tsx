import { MaterialIcons } from '@expo/vector-icons'
import { Array, pipe } from 'effect'
import { useState } from 'react'
import { Image, Pressable, ScrollView, Text, View } from 'react-native'
import { BottomSheet } from 'src/components/BottomSheet'
import { usePlants } from 'src/hooks/usePlants'
import { iconColors } from 'src/theme'

interface PlantSelectorProps {
  selectedIds: string[]
  onSelectionChange: (ids: string[]) => void
  label?: string
}

export function PlantSelector({
  selectedIds,
  onSelectionChange,
  label = 'Select Plants',
}: PlantSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const { data: plantsData } = usePlants()
  const plants = plantsData?.items ?? []

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
      ? 'Select plants'
      : selectedPlants.length === 1
        ? selectedPlants[0].name
        : `${selectedPlants.length} plants selected`

  return (
    <>
      <View className="mb-4">
        {label && (
          <Text className="text-sm mb-2 font-medium text-text-primary">
            {label}
          </Text>
        )}
        <Pressable
          onPress={() => setIsOpen(true)}
          className="flex-row items-center justify-between h-14 px-4 rounded-xl bg-input-bg active:opacity-80"
        >
          <View className="flex-row items-center flex-1">
            {selectedPlants.length > 0 && (
              <View className="flex-row mr-2">
                {pipe(
                  selectedPlants,
                  Array.take(3),
                  Array.map((plant, index) => (
                    <Image
                      key={plant.id}
                      source={{ uri: plant.imageUrl ?? undefined }}
                      className="w-8 h-8 rounded-full border-2 border-surface"
                      style={{
                        marginLeft: index > 0 ? -12 : 0,
                      }}
                    />
                  ))
                )}
              </View>
            )}
            <Text
              className={`text-base flex-1 font-regular ${selectedPlants.length > 0 ? 'text-text-primary' : 'text-text-muted'}`}
              numberOfLines={1}
            >
              {displayText}
            </Text>
          </View>
          <MaterialIcons
            name="expand-more"
            size={24}
            color={iconColors.textMuted}
          />
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
                  className="flex-row items-center py-3 border-b border-border"
                >
                  <Image
                    source={{ uri: plant.imageUrl ?? undefined }}
                    className="w-12 h-12 rounded-full mr-3 bg-border"
                  />
                  <Text
                    className={`flex-1 text-base text-text-primary ${isSelected ? 'font-semibold' : 'font-regular'}`}
                  >
                    {plant.name}
                  </Text>
                  <View
                    className={`w-6 h-6 rounded items-center justify-center ${isSelected ? 'bg-primary' : 'border-2 border-border'}`}
                  >
                    {isSelected && (
                      <MaterialIcons
                        name="check"
                        size={18}
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
