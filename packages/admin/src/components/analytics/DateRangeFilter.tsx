import { Array, pipe } from 'effect'
import type {
  AnalyticsFilterState,
  AnalyticsRangePreset,
} from '@/hooks/analytics/use-analytics-filters'

const PRESETS: ReadonlyArray<{ value: AnalyticsRangePreset; label: string }> = [
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
]

interface DateRangeFilterProps {
  filters: AnalyticsFilterState
}

export const DateRangeFilter = ({ filters }: DateRangeFilterProps) => (
  <div className="inline-flex rounded-md border border-gray-200 bg-white p-0.5 text-sm">
    {pipe(
      PRESETS,
      Array.map((preset) => {
        const isActive = filters.preset === preset.value
        return (
          <button
            key={preset.value}
            type="button"
            onClick={() => filters.setPreset(preset.value)}
            className={`rounded px-3 py-1 font-medium transition-colors ${
              isActive
                ? 'bg-primary-600 text-white'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {preset.label}
          </button>
        )
      })
    )}
  </div>
)
