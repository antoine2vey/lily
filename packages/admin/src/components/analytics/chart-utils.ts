import { Array, Option, Order, pipe } from 'effect'
import type { LegendPayload } from 'recharts'

export interface TimeSeriesSeries {
  readonly key: string
  readonly points: ReadonlyArray<{
    readonly date: string
    readonly value: number
  }>
}

/**
 * Reshape row-per-(series, date) into row-per-date / column-per-series — the
 * wide format Recharts consumes when rendering stacked areas or multiple lines.
 */
export const toChartData = (
  series: ReadonlyArray<TimeSeriesSeries>
): ReadonlyArray<Record<string, string | number>> => {
  const byDate = new Map<string, Record<string, string | number>>()
  for (const s of series) {
    for (const p of s.points) {
      const existing = byDate.get(p.date) ?? { date: p.date }
      existing[s.key] = p.value
      byDate.set(p.date, existing)
    }
  }
  return pipe(
    Array.fromIterable(byDate.values()),
    Array.sort(
      Order.mapInput(Order.String, (r: Record<string, string | number>) =>
        String(r.date)
      )
    )
  )
}

export const CHART_COLORS = [
  '#2563eb',
  '#16a34a',
  '#ea580c',
  '#9333ea',
  '#db2777',
  '#0891b2',
] as const

// Recharts 3 sorts legend items by label by default; keep the series order.
export const legendInSeriesOrder =
  (series: ReadonlyArray<TimeSeriesSeries>) =>
  (item: LegendPayload): number =>
    pipe(
      series,
      Array.findFirstIndex((s) => s.key === item.value),
      Option.getOrElse(() => series.length)
    )

export const seriesColor = (
  colors: Array.NonEmptyReadonlyArray<string>,
  index: number
): string =>
  pipe(
    colors,
    Array.get(index % colors.length),
    Option.getOrElse(() => Array.headNonEmpty(colors))
  )
