import { MaterialIcons } from '@expo/vector-icons'
import { Array, pipe } from 'effect'
import { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { BottomSheet } from 'src/components/BottomSheet'
import { iconColors } from 'src/theme'

const CATEGORIES = [
  { id: 'indoor', label: 'Indoor', icon: 'home' as const },
  { id: 'outdoor', label: 'Outdoor', icon: 'park' as const },
  { id: 'succulent', label: 'Succulent', icon: 'eco' as const },
  { id: 'tropical', label: 'Tropical', icon: 'filter-vintage' as const },
  { id: 'flowering', label: 'Flowering', icon: 'local-florist' as const },
  { id: 'herb', label: 'Herb', icon: 'grass' as const },
  { id: 'tree', label: 'Tree', icon: 'nature' as const },
  { id: 'vine', label: 'Vine', icon: 'spa' as const },
]

interface CategoryPickerProps {
  value: string
  onSelect: (category: string) => void
  label?: string
}

export function CategoryPicker({
  value,
  onSelect,
  label = 'Category',
}: CategoryPickerProps) {
  const [isOpen, setIsOpen] = useState(false)

  const selectedCategory = pipe(
    CATEGORIES,
    Array.findFirst((c) => c.id === value)
  )

  const selectedLabel =
    selectedCategory._tag === 'Some'
      ? selectedCategory.value.label
      : 'Select category'

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
          <Text
            className={`text-base font-regular ${value ? 'text-text-primary' : 'text-text-muted'}`}
          >
            {selectedLabel}
          </Text>
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
        title="Select Category"
        snapPoints={['60%']}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          {pipe(
            CATEGORIES,
            Array.map((category) => (
              <Pressable
                key={category.id}
                onPress={() => {
                  onSelect(category.id)
                  setIsOpen(false)
                }}
                className="flex-row items-center py-4 border-b border-border active:bg-primary-tint"
              >
                <View
                  className={`w-10 h-10 rounded-full items-center justify-center mr-3 ${
                    value === category.id ? 'bg-primary' : 'bg-primary-tint'
                  }`}
                >
                  <MaterialIcons
                    name={category.icon}
                    size={20}
                    color={
                      value === category.id
                        ? iconColors.white
                        : iconColors.primary
                    }
                  />
                </View>
                <Text
                  className={`flex-1 text-base text-text-primary ${
                    value === category.id ? 'font-semibold' : 'font-regular'
                  }`}
                >
                  {category.label}
                </Text>
                {value === category.id && (
                  <MaterialIcons
                    name="check"
                    size={24}
                    color={iconColors.primary}
                  />
                )}
              </Pressable>
            ))
          )}
        </ScrollView>
      </BottomSheet>
    </>
  )
}
