import { Array, pipe } from 'effect'

export interface HorizontalBarRow {
  readonly label: string
  readonly count: number
  readonly accent?: string
}

interface HorizontalBarProps {
  rows: ReadonlyArray<HorizontalBarRow>
  total: number
}

export const HorizontalBar = ({ rows, total }: HorizontalBarProps) => {
  const safeTotal = total > 0 ? total : 1
  return (
    <div className="space-y-2">
      {pipe(
        rows,
        Array.map((row) => {
          const pct = Math.round((row.count / safeTotal) * 100)
          return (
            <div key={row.label}>
              <div className="mb-1 flex items-center justify-between text-xs text-gray-600">
                <span className="font-medium">{row.label}</span>
                <span>
                  {row.count.toLocaleString()}{' '}
                  <span className="text-gray-400">({pct}%)</span>
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded bg-gray-100">
                <div
                  className="h-full rounded bg-primary-500"
                  style={{
                    width: `${pct}%`,
                    ...(row.accent ? { backgroundColor: row.accent } : {}),
                  }}
                />
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
