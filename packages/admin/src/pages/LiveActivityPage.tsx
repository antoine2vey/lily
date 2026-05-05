import { Array, Match, Option, pipe, String } from 'effect'
import { useEffect, useRef, useState } from 'react'
import { useAdminUsers } from '@/hooks/use-admin-users'
import {
  type TriggerOutcomeKind,
  useTriggerLiveActivity,
} from '@/hooks/use-trigger-live-activity'

interface SelectedUser {
  readonly id: string
  readonly name: string | null
  readonly email: string
}

const outcomeBadge = (kind: TriggerOutcomeKind): string =>
  pipe(
    Match.value(kind),
    Match.when('accepted', () => 'bg-green-50 text-green-700 border-green-200'),
    Match.when(
      'send-error',
      () => 'bg-amber-50 text-amber-700 border-amber-200'
    ),
    Match.when(
      'config-error',
      () => 'bg-amber-50 text-amber-700 border-amber-200'
    ),
    Match.when(
      'token-invalidated',
      () => 'bg-red-50 text-red-700 border-red-200'
    ),
    Match.exhaustive
  )

const outcomeLabel = (kind: TriggerOutcomeKind): string =>
  pipe(
    Match.value(kind),
    Match.when('accepted', () => 'Accepted by APNs'),
    Match.when('send-error', () => 'Send error'),
    Match.when('config-error', () => 'Config error'),
    Match.when('token-invalidated', () => 'Token invalidated'),
    Match.exhaustive
  )

export const LiveActivityPage = () => {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedUser, setSelectedUser] = useState<SelectedUser | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const users = useAdminUsers(debouncedSearch, !selectedUser)
  const trigger = useTriggerLiveActivity()

  const showDropdown =
    !dismissed &&
    !selectedUser &&
    !!users.data &&
    pipe(search, String.trim, (s) => s.length >= 2)

  useEffect(() => {
    if (selectedUser) return
    setDismissed(false)
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search, selectedUser])

  useEffect(() => {
    if (!showDropdown) return
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setDismissed(true)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showDropdown])

  const handleSelectUser = (user: SelectedUser) => {
    setSelectedUser(user)
    setSearch('')
    trigger.reset()
  }

  const handleClearUser = () => {
    setSelectedUser(null)
    setSearch('')
    trigger.reset()
  }

  const handleTrigger = () => {
    if (!selectedUser) return
    trigger.mutate(selectedUser.id)
  }

  const results = pipe(
    Option.fromNullable(users.data),
    Option.map((d) => d.items),
    Option.getOrElse((): ReadonlyArray<SelectedUser> => [])
  )

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">Live Activity</h1>
      <p className="mb-6 text-sm text-gray-500">
        Force a fresh push-to-start to a user's iOS device(s). The response
        shows each device's APNs handoff status — useful when a Live Activity
        isn't appearing and you need to tell server-side from device-side
        failure.
      </p>

      <div className="space-y-6 rounded-lg border border-gray-200 bg-white p-6">
        {/* User search */}
        <div>
          <label
            htmlFor="userSearch"
            className="block text-sm font-medium text-gray-700"
          >
            Select user
          </label>

          {selectedUser ? (
            <div className="mt-1 flex items-center justify-between rounded-md border border-primary-200 bg-primary-50 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-primary-900">
                  {selectedUser.name ?? 'No name'}
                </p>
                <p className="text-xs text-primary-600">{selectedUser.email}</p>
              </div>
              <button
                type="button"
                onClick={handleClearUser}
                className="text-sm text-primary-600 hover:text-primary-800"
              >
                Change
              </button>
            </div>
          ) : (
            <div className="relative" ref={dropdownRef}>
              <input
                id="userSearch"
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email..."
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
              {showDropdown && (
                <div className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border border-gray-200 bg-white shadow-lg">
                  {users.isLoading && (
                    <p className="px-3 py-2 text-sm text-gray-500">
                      Searching...
                    </p>
                  )}
                  {Array.isEmptyReadonlyArray(results) && !users.isLoading && (
                    <p className="px-3 py-2 text-sm text-gray-500">
                      No users found
                    </p>
                  )}
                  {pipe(
                    results,
                    Array.map((user) => (
                      <button
                        type="button"
                        key={user.id}
                        onClick={() => handleSelectUser(user)}
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                      >
                        <span className="font-medium text-gray-900">
                          {user.name ?? 'No name'}
                        </span>
                        <span className="ml-2 text-gray-500">{user.email}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleTrigger}
          disabled={!selectedUser || trigger.isPending}
          className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {trigger.isPending ? 'Triggering...' : 'Trigger Live Activity Start'}
        </button>

        {trigger.isError && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
            {trigger.error.message}
          </div>
        )}

        {trigger.isSuccess && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 rounded-md bg-gray-50 p-3 text-xs">
              <div>
                <p className="text-gray-500">Activity ID</p>
                <p className="font-mono text-gray-900">
                  {trigger.data.activityId}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Content state</p>
                <p className="font-medium text-gray-900">
                  {trigger.data.contentStateBuilt
                    ? 'built'
                    : 'empty (no due tasks)'}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Start tokens</p>
                <p className="font-medium text-gray-900">
                  {trigger.data.startTokenCount}
                </p>
              </div>
            </div>

            {Array.isEmptyReadonlyArray(trigger.data.outcomes) ? (
              <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-700">
                No push attempts were made.{' '}
                {trigger.data.contentStateBuilt
                  ? 'User has no active push-to-start tokens — open the app on the device to register one.'
                  : 'User has nothing due today, so no Live Activity payload to send.'}
              </div>
            ) : (
              <div className="overflow-hidden rounded-md border border-gray-200">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-3 py-2">Device token</th>
                      <th className="px-3 py-2">Outcome</th>
                      <th className="px-3 py-2">APNs ID / reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {pipe(
                      trigger.data.outcomes,
                      Array.map((outcome) => (
                        <tr key={outcome.deviceTokenId}>
                          <td className="px-3 py-2 font-mono text-xs text-gray-600">
                            {outcome.deviceTokenId}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${outcomeBadge(outcome.kind)}`}
                            >
                              {outcomeLabel(outcome.kind)}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-gray-600">
                            {outcome.apnsId ?? outcome.reason ?? '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-xs text-gray-500">
              An <span className="font-medium">accepted</span> outcome means
              APNs took the push. The activity has actually started on-device
              only once a corresponding{' '}
              <span className="font-mono">activity_push_tokens</span> row of
              kind <span className="font-mono">update</span> appears for this
              user (the device replies via{' '}
              <span className="font-mono">registerActivityToken</span>).
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
