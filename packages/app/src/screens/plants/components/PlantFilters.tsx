import { Array } from 'effect'
import { ScrollView, Text, TouchableOpacity } from 'react-native'

type FilterOption = 'all' | 'healthy' | 'attention'

interface FilterDefinition {
  key: FilterOption
  label: string
}

const FILTERS: ReadonlyArray<FilterDefinition> = [
  { key: 'all', label: 'All' },
  { key: 'healthy', label: 'Healthy' },
  { key: 'attention', label: 'Needs Attention' },
]

interface PlantFiltersProps {
  selectedFilter: FilterOption
  onFilterChange: (filter: FilterOption) => void
  counts: {
    all: number
    healthy: number
    attention: number
  }
}

export function PlantFilters({
  selectedFilter,
  onFilterChange,
  counts,
}: PlantFiltersProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="w-full"
      contentContainerStyle={{
        flexDirection: 'row-reverse',
        gap: 12,
        paddingHorizontal: 20,
        paddingVertical: 12,
      }}
      testID="plant-filters"
    >
      {Array.map(FILTERS, ({ key, label }) => {
        const isSelected = selectedFilter === key
        return (
          <TouchableOpacity
            key={key}
            onPress={() => onFilterChange(key)}
            activeOpacity={0.7}
            className={`h-10 shrink-0 items-center justify-center px-6 rounded-full mb-4 ${
              isSelected
                ? 'bg-primary'
                : 'bg-white dark:bg-surface-dark border border-border dark:border-slate-700'
            }`}
          >
            <Text
              className={`text-sm ${
                isSelected
                  ? 'text-white font-semibold'
                  : 'text-text-primary dark:text-white font-medium'
              }`}
            >
              {`${label} (${counts[key]})`}
            </Text>
          </TouchableOpacity>
        )
      })}
    </ScrollView>
  )
}

export type { FilterOption }
