import { Match, pipe } from 'effect'

const statusConfig = (status: string) =>
  pipe(
    Match.value(status),
    Match.when('active', () => ({
      label: 'Active',
      className: 'bg-green-100 text-green-800',
    })),
    Match.when('suspended', () => ({
      label: 'Suspended',
      className: 'bg-yellow-100 text-yellow-800',
    })),
    Match.when('banned', () => ({
      label: 'Banned',
      className: 'bg-red-100 text-red-800',
    })),
    Match.when('pending_deletion', () => ({
      label: 'Pending Deletion',
      className: 'bg-gray-100 text-gray-700',
    })),
    Match.orElse(() => ({
      label: status,
      className: 'bg-gray-100 text-gray-700',
    }))
  )

export const UserStatusBadge = ({ status }: { readonly status: string }) => {
  const config = statusConfig(status)
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${config.className}`}
    >
      {config.label}
    </span>
  )
}
