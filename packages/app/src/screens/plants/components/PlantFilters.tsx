import { Array } from 'effect'
import { useTranslation } from 'react-i18next'
import { ScrollView, Text, TouchableOpacity } from 'react-native'

type FilterOption = 'all' | 'healthy' | 'attention'

interface FilterDefinition {
  key: FilterOption
  labelKey: 'filterAll' | 'filterHealthy' | 'filterNeedsAttention'
}

interface PlantFiltersProps {
  selectedFilter: FilterOption
  onFilterChange: (filter: FilterOption) => void
  counts: {
    all: number
    healthy: number
    attention: number
  }
}

const FILTERS: ReadonlyArray<FilterDefinition> = [
  { key: 'all', labelKey: 'filterAll' },
  { key: 'healthy', labelKey: 'filterHealthy' },
  { key: 'attention', labelKey: 'filterNeedsAttention' },
]

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
        flexDirection: 'row-reverse',
        gap: 12,
        paddingHorizontal: 20,
        paddingVertical: 12,
      }}
      testID="plant-filters"
    >
      {Array.map(FILTERS, ({ key, labelKey }) => {
        const isSelected = selectedFilter === key
        return (
          <TouchableOpacity
            key={key}
            onPress={() => onFilterChange(key)}
            activeOpacity={0.7}
            className={`h-10 shrink-0 items-center justify-center px-6 rounded-full ${
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
              {`${t(`list.${labelKey}`)} (${counts[key]})`}
            </Text>
          </TouchableOpacity>
        )
      })}
    </ScrollView>
  )
}

export type { FilterOption }
