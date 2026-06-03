import { Array, Match, Option, pipe } from 'effect'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { RoleBadge } from '@/components/RoleBadge'
import { UserStatusBadge } from '@/components/UserStatusBadge'
import {
  type AdminUserListItem,
  useAdminUsersList,
} from '@/hooks/use-admin-users-list'
import { formatShortDate } from '@/lib/format'

type TableState = 'loading' | 'error' | 'empty' | 'data'

export const UsersPage = () => {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [role, setRole] = useState('')
  const [status, setStatus] = useState('')

  // Debounce the search box so we don't refetch on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  const { data, isLoading, isError } = useAdminUsersList({
    page,
    search: debouncedSearch,
    role,
    status,
  })

  const items = pipe(
    Option.fromNullable(data),
    Option.map((d) => d.items),
    Option.getOrElse((): ReadonlyArray<AdminUserListItem> => [])
  )

  const tableState: TableState = pipe(
    Match.value({
      loading: isLoading,
      error: isError,
      empty: Array.isEmptyReadonlyArray(items),
    }),
    Match.when({ loading: true }, () => 'loading' as const),
    Match.when({ error: true }, () => 'error' as const),
    Match.when({ empty: true }, () => 'empty' as const),
    Match.orElse(() => 'data' as const)
  )

  const onFilterChange = (apply: () => void) => {
    apply()
    setPage(1)
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Users</h1>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => onFilterChange(() => setSearch(e.target.value))}
          placeholder="Search by name or email..."
          className="w-72 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
        <select
          value={role}
          onChange={(e) => onFilterChange(() => setRole(e.target.value))}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        >
          <option value="">All roles</option>
          <option value="user">User</option>
          <option value="admin">Admin</option>
        </select>
        <select
          value={status}
          onChange={(e) => onFilterChange(() => setStatus(e.target.value))}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="banned">Banned</option>
          <option value="pending_deletion">Pending Deletion</option>
        </select>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-xs font-medium uppercase text-gray-500">
              <th className="px-4 py-3">Name / Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Joined</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {pipe(
              Match.value(tableState),
              Match.when('loading', () => (
                <tr key="loading">
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-gray-500"
                  >
                    Loading...
                  </td>
                </tr>
              )),
              Match.when('error', () => (
                <tr key="error">
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-red-600"
                  >
                    Failed to load users.
                  </td>
                </tr>
              )),
              Match.when('empty', () => (
                <tr key="empty">
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-gray-500"
                  >
                    No users found.
                  </td>
                </tr>
              )),
              Match.when('data', () =>
                pipe(
                  items,
                  Array.map((user) => (
                    <tr
                      key={user.id}
                      className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">
                          {user.name ?? '—'}
                        </p>
                        <p className="text-xs text-gray-500">{user.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <RoleBadge role={user.role} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <UserStatusBadge status={user.status} />
                          {user.deletedAt && (
                            <span className="inline-flex rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
                              Deleted
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {formatShortDate(user.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          to={`/users/${user.id}`}
                          className="rounded bg-gray-50 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))
                )
              ),
              Match.exhaustive
            )}
          </tbody>
        </table>

        {data && data.total > data.limit && (
          <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3">
            <p className="text-xs text-gray-500">
              Page {data.page} of {Math.ceil(data.total / data.limit)} ·{' '}
              {data.total} users
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => p - 1)}
                disabled={page <= 1}
                className="rounded border border-gray-300 px-3 py-1 text-xs disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={!data.hasMore}
                className="rounded border border-gray-300 px-3 py-1 text-xs disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
