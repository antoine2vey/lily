import {
  isLiquidGlassSupported,
  LiquidGlassView,
} from '@callstack/liquid-glass'
import { Array } from 'effect'
import { useTranslation } from 'react-i18next'
import {
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'

type FilterOption = 'all' | 'watering' | 'fertilizing' | 'needsAttention'

interface FilterDefinition {
  key: FilterOption
  labelKey:
    | 'filterAll'
    | 'filterNeedsWatering'
    | 'filterNeedsFertilizing'
    | 'filterNeedsAttention'
}

interface PlantFiltersProps {
  selectedFilter: FilterOption
  onFilterChange: (filter: FilterOption) => void
  counts: {
    all: number
    watering: number
    fertilizing: number
    needsAttention: number
  }
}

const FILTERS: ReadonlyArray<FilterDefinition> = [
  { key: 'all', labelKey: 'filterAll' },
  { key: 'watering', labelKey: 'filterNeedsWatering' },
  { key: 'fertilizing', labelKey: 'filterNeedsFertilizing' },
  { key: 'needsAttention', labelKey: 'filterNeedsAttention' },
]

const useGlass = isLiquidGlassSupported && Platform.OS === 'ios'

function FilterPill({
  isSelected,
  onPress,
  label,
}: {
  isSelected: boolean
  onPress: () => void
  label: string
}) {
  const touchable = (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className={`h-10 shrink-0 items-center justify-center px-4 rounded-full ${
        isSelected ? 'bg-primary' : ''
      }`}
    >
      <Text
        className={`text-sm ${
          isSelected
            ? 'text-white font-semibold'
            : 'text-text-primary dark:text-white font-medium'
        }`}
      >
        {label}
      </Text>
    </TouchableOpacity>
  )

  if (isSelected) return touchable

  if (useGlass) {
    return (
      <LiquidGlassView interactive={false} style={{ borderRadius: 20 }}>
        {touchable}
      </LiquidGlassView>
    )
  }

  return (
    <View className="bg-white dark:bg-surface-dark border border-border dark:border-slate-700 rounded-full">
      {touchable}
    </View>
  )
}

export function PlantFilters({
  selectedFilter,
  onFilterChange,
  counts,
}: PlantFiltersProps) {
  const { t } = useTranslation('plants')

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="w-full"
      style={{ flexGrow: 0, flexShrink: 0 }}
      contentContainerStyle={{
        gap: 8,
        paddingHorizontal: 24,
        paddingVertical: 4,
      }}
      testID="plant-filters"
    >
      {Array.map(FILTERS, ({ key, labelKey }) => (
        <FilterPill
          key={key}
          isSelected={selectedFilter === key}
          onPress={() => onFilterChange(key)}
          label={`${t(`list.${labelKey}`)} (${counts[key]})`}
        />
      ))}
    </ScrollView>
  )
}

export type { FilterOption }
