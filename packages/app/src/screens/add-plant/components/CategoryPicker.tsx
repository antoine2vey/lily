import { MaterialIcons } from '@expo/vector-icons'
import { Array, Option, pipe } from 'effect'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { BottomSheet } from '@/components/BottomSheet'
import { useIconColors } from '@/hooks/useIconColors'

type CategoryKey =
  | 'indoor'
  | 'outdoor'
  | 'succulent'
  | 'tropical'
  | 'flowering'
  | 'herb'
  | 'tree'
  | 'vine'

interface CategoryDefinition {
  id: CategoryKey
  icon: keyof typeof MaterialIcons.glyphMap
}

const CATEGORIES: ReadonlyArray<CategoryDefinition> = [
  { id: 'indoor', icon: 'home' },
  { id: 'outdoor', icon: 'park' },
  { id: 'succulent', icon: 'eco' },
  { id: 'tropical', icon: 'filter-vintage' },
  { id: 'flowering', icon: 'local-florist' },
  { id: 'herb', icon: 'grass' },
  { id: 'tree', icon: 'nature' },
  { id: 'vine', icon: 'spa' },
]

interface CategoryPickerProps {
  value: string
  onSelect: (category: string) => void
  label?: string
}

export function CategoryPicker({
  value,
  onSelect,
  label,
}: CategoryPickerProps) {
  const { t } = useTranslation('addPlant')
  const iconColors = useIconColors()
  const [isOpen, setIsOpen] = useState(false)
  const displayLabel = Option.getOrElse(Option.fromNullable(label), () =>
    t('basicInfo.categoryLabel')
  )

  const selectedCategory = pipe(
    CATEGORIES,
    Array.findFirst((c) => c.id === value)
  )

  const selectedLabel =
    selectedCategory._tag === 'Some'
      ? t(`basicInfo.categories.${selectedCategory.value.id}`)
      : t('basicInfo.selectCategory')

  return (
    <>
      <View className="gap-2">
        {displayLabel && (
          <Text className="text-sm ml-1 font-semibold text-text-secondary dark:text-slate-300">
            {displayLabel}
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
        title={t('basicInfo.selectCategoryTitle')}
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
                  {t(`basicInfo.categories.${category.id}`)}
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
