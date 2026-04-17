import { DateTime, Option, pipe } from 'effect'
import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

export type AnalyticsRangePreset = '7d' | '30d' | '90d'

const PRESET_DAYS: Record<AnalyticsRangePreset, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
}

const isPreset = (v: string | null): v is AnalyticsRangePreset =>
  v === '7d' || v === '30d' || v === '90d'

export interface AnalyticsFilterState {
  preset: AnalyticsRangePreset
  setPreset: (preset: AnalyticsRangePreset) => void
}

/**
 * Read & write the analytics date-range preset via URL query params.
 * Using URL state means admins can share a link that reproduces what they see.
 */
export const useAnalyticsFilters = (): AnalyticsFilterState => {
  const [params, setParams] = useSearchParams()

  const preset = pipe(
    Option.fromNullable(params.get('range')),
    Option.filter(isPreset),
    Option.getOrElse(() => '30d' as AnalyticsRangePreset)
  )

  const setPreset = useCallback(
    (next: AnalyticsRangePreset) => {
      const nextParams = new URLSearchParams(params)
      nextParams.set('range', next)
      setParams(nextParams, { replace: true })
    },
    [params, setParams]
  )

  return { preset, setPreset }
}

/**
 * Compute the absolute ISO date bounds for a preset at the moment of call.
 * Called from inside `queryFn` — NOT during render — so the "now" it snapshots
 * doesn't leak into React's render cycle or React Query's cache keys.
 */
export const resolvePresetRange = (
  preset: AnalyticsRangePreset
): { from: string; to: string } => {
  const now = DateTime.unsafeNow()
  return {
    from: DateTime.formatIso(
      DateTime.subtract(now, { days: PRESET_DAYS[preset] })
    ),
    to: DateTime.formatIso(now),
  }
}
