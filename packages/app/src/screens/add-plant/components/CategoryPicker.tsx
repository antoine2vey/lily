import { MaterialIcons } from '@expo/vector-icons'
import { Array, pipe } from 'effect'
import { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { BottomSheet } from 'src/components/BottomSheet'
import { useIconColors } from 'src/hooks/useIconColors'

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
  const iconColors = useIconColors()
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
      <View className="gap-2">
        {label && (
          <Text className="text-sm ml-1 font-semibold text-text-secondary dark:text-slate-300">
            {label}
          </Text>
        )}
        <Pressable
          onPress={() => setIsOpen(true)}
          className="flex-row items-center justify-between px-4 py-3.5 rounded-2xl bg-surface dark:bg-surface-dark border-2 border-border/50 dark:border-slate-700/50 active:opacity-80"
        >
          <Text
            className={`text-base font-medium ${value ? 'text-text-primary dark:text-white' : 'text-text-muted dark:text-slate-400'}`}
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
                className="flex-row items-center py-4 border-b border-border dark:border-slate-700 active:bg-primary-tint dark:active:bg-primary/20"
              >
                <View
                  className={`w-10 h-10 rounded-full items-center justify-center mr-3 ${
                    value === category.id
                      ? 'bg-primary'
                      : 'bg-primary-tint dark:bg-primary/20'
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
                  className={`flex-1 text-base text-text-primary dark:text-white ${
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
