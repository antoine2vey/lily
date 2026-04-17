import type { ReactNode } from 'react'

interface KpiCardProps {
  label: string
  value: ReactNode
  hint?: ReactNode
}

export const KpiCard = ({ label, value, hint }: KpiCardProps) => (
  <div className="rounded-lg border border-gray-200 bg-white p-4">
    <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
      {label}
    </div>
    <div className="mt-2 text-2xl font-semibold text-gray-900">{value}</div>
    {hint ? <div className="mt-1 text-xs text-gray-500">{hint}</div> : null}
  </div>
)
