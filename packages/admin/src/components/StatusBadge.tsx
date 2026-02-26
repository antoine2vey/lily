import { Match, pipe } from 'effect'

type JobStatus = 'pending' | 'in_progress' | 'completed' | 'failed'

const statusConfig = (status: JobStatus) =>
  pipe(
    Match.value(status),
    Match.when('pending', () => ({
      label: 'Pending',
      className: 'bg-yellow-100 text-yellow-800',
    })),
    Match.when('in_progress', () => ({
      label: 'In Progress',
      className: 'bg-blue-100 text-blue-800',
    })),
    Match.when('completed', () => ({
      label: 'Completed',
      className: 'bg-green-100 text-green-800',
    })),
    Match.when('failed', () => ({
      label: 'Failed',
      className: 'bg-red-100 text-red-800',
    })),
    Match.exhaustive
  )

export const StatusBadge = ({ status }: { readonly status: JobStatus }) => {
  const config = statusConfig(status)
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${config.className}`}
    >
      {config.label}
    </span>
  )
}
