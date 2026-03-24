import { GIFT_DURATION_LABELS } from '@lily/shared/admin'
import { useQueryClient } from '@tanstack/react-query'
import { Array, pipe } from 'effect'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  type GiftCodeItem,
  useDeleteGiftCode,
  useGiftCodes,
} from '@/hooks/use-gift-codes'

const durationLabel: Record<string, string> = GIFT_DURATION_LABELS.en

const formatDate = (dateStr: string): string =>
  new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

const StatusBadge = ({ isActive }: { isActive: boolean }) => (
  <span
    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
      isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
    }`}
  >
    {isActive ? 'Active' : 'Inactive'}
  </span>
)

const UsageDisplay = ({ current, max }: { current: number; max: number }) => (
  <span className="text-gray-600">
    {current}/{max === 0 ? '\u221E' : max}
  </span>
)

const DeleteButton = ({ giftCode }: { giftCode: GiftCodeItem }) => {
  const queryClient = useQueryClient()
  const deleteMutation = useDeleteGiftCode()

  const handleDelete = () => {
    if (!window.confirm(`Delete gift code "${giftCode.code}"?`)) return
    deleteMutation.mutate(giftCode.id, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['gift-codes'] })
      },
    })
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={deleteMutation.isPending}
      className="rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-50"
    >
      {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
    </button>
  )
}

export const GiftCodesPage = () => {
  const [page, setPage] = useState(1)
  const { data, isLoading, isError } = useGiftCodes(page)

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Gift Codes</h1>
        <Link
          to="/gift-codes/new"
          className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
        >
          Create Gift Code
        </Link>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white">
        {isLoading && <p className="p-6 text-sm text-gray-500">Loading...</p>}

        {isError && (
          <p className="p-6 text-sm text-red-600">Failed to load gift codes.</p>
        )}

        {data && (
          <>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs font-medium uppercase text-gray-500">
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Duration</th>
                  <th className="px-4 py-3">Usage</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Expires</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {Array.isEmptyReadonlyArray(data.items) ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-8 text-center text-gray-500"
                    >
                      No gift codes yet.
                    </td>
                  </tr>
                ) : (
                  pipe(
                    data.items,
                    Array.map((giftCode) => (
                      <tr
                        key={giftCode.id}
                        className="border-b border-gray-100 last:border-0"
                      >
                        <td className="px-4 py-3 font-mono font-medium text-gray-900">
                          {giftCode.code}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {durationLabel[giftCode.duration] ??
                            giftCode.duration}
                        </td>
                        <td className="px-4 py-3">
                          <UsageDisplay
                            current={giftCode.currentUsages}
                            max={giftCode.maxUsages}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge isActive={giftCode.isActive} />
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {giftCode.expiresAt
                            ? formatDate(giftCode.expiresAt)
                            : '\u2014'}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {formatDate(giftCode.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <Link
                              to={`/gift-codes/${giftCode.id}/edit`}
                              className="rounded bg-gray-50 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
                            >
                              Edit
                            </Link>
                            <DeleteButton giftCode={giftCode} />
                          </div>
                        </td>
                      </tr>
                    ))
                  )
                )}
              </tbody>
            </table>

            {data.total > data.limit && (
              <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3">
                <p className="text-xs text-gray-500">
                  Page {data.page} of {Math.ceil(data.total / data.limit)}
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
          </>
        )}
      </div>
    </div>
  )
}
