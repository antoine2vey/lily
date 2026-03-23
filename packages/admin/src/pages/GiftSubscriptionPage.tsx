import { Array, Option, pipe, String } from 'effect'
import { useEffect, useRef, useState } from 'react'
import { useAdminUsers } from '@/hooks/use-admin-users'
import type { GiftDuration } from '@/hooks/use-gift-subscription'
import { useGiftSubscription } from '@/hooks/use-gift-subscription'

interface SelectedUser {
  readonly id: string
  readonly name: string | null
  readonly email: string
}

const durations: ReadonlyArray<{
  readonly value: GiftDuration
  readonly label: string
}> = [
  { value: '7d', label: '7 Days' },
  { value: '1m', label: '1 Month' },
  { value: '1y', label: '1 Year' },
  { value: 'infinite', label: 'Lifetime' },
]

export const GiftSubscriptionPage = () => {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedUser, setSelectedUser] = useState<SelectedUser | null>(null)
  const [duration, setDuration] = useState<GiftDuration>('1m')
  const [dismissed, setDismissed] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const users = useAdminUsers(debouncedSearch, !selectedUser)
  const gift = useGiftSubscription()

  const showDropdown =
    !dismissed &&
    !selectedUser &&
    !!users.data &&
    pipe(search, String.trim, (s) => s.length >= 2)

  // Debounce search input
  useEffect(() => {
    if (selectedUser) return
    setDismissed(false)
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search, selectedUser])

  // Close dropdown on outside click
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
    gift.reset()
  }

  const handleClearUser = () => {
    setSelectedUser(null)
    setSearch('')
    gift.reset()
  }

  const handleGift = () => {
    if (!selectedUser) return
    gift.mutate({ userId: selectedUser.id, duration })
  }

  const results = pipe(
    Option.fromNullable(users.data),
    Option.map((d) => d.items),
    Option.getOrElse((): ReadonlyArray<SelectedUser> => [])
  )

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Gift Subscription</h1>

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

        {/* Duration selection */}
        <div>
          <p className="block text-sm font-medium text-gray-700">Duration</p>
          <div className="mt-2 grid grid-cols-4 gap-3">
            {pipe(
              durations,
              Array.map((d) => (
                <button
                  type="button"
                  key={d.value}
                  onClick={() => setDuration(d.value)}
                  className={`rounded-md border px-4 py-2 text-sm font-medium ${
                    duration === d.value
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {d.label}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Gift button */}
        <button
          type="button"
          onClick={handleGift}
          disabled={!selectedUser || gift.isPending}
          className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {gift.isPending ? 'Gifting...' : 'Gift Subscription'}
        </button>

        {/* Success message */}
        {gift.isSuccess && (
          <div className="rounded-md bg-green-50 p-3 text-sm text-green-700">
            {gift.data.message}
          </div>
        )}

        {/* Error message */}
        {gift.isError && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
            {gift.error.message}
          </div>
        )}
      </div>
    </div>
  )
}
