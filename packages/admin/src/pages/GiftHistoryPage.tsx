import { GIFT_DURATION_LABELS } from '@lily/shared/admin'
import { useQueryClient } from '@tanstack/react-query'
import { Array, Option, pipe, Schema } from 'effect'
import { useState } from 'react'
import { type GiftEvent, useGiftHistory } from '@/hooks/use-gift-history'
import { useRevokeGift } from '@/hooks/use-revoke-gift'

const GiftMetadata = Schema.Struct({
  giftedBy: Schema.optional(Schema.String),
  revokedBy: Schema.optional(Schema.String),
  duration: Schema.optional(Schema.String),
})
type GiftMetadata = typeof GiftMetadata.Type

const emptyMetadata: GiftMetadata = {}

const decodeMetadata = Schema.decodeOption(Schema.parseJson(GiftMetadata))

const durationLabel: Record<string, string> = pipe(
  Option.fromNullable(GIFT_DURATION_LABELS.en),
  Option.getOrElse(() => ({}) as Record<string, string>)
)

const formatDate = (dateStr: string): string =>
  new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

const EventBadge = ({ eventType }: { eventType: string }) => {
  const isRevoked = eventType === 'subscription_gift_revoked'
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
        isRevoked ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
      }`}
    >
      {isRevoked ? 'Revoked' : 'Gifted'}
    </span>
  )
}

const RevokeButton = ({ event }: { event: GiftEvent }) => {
  const queryClient = useQueryClient()
  const revoke = useRevokeGift()

  const handleRevoke = () => {
    if (
      !window.confirm(`Revoke gift for ${event.userName ?? event.userEmail}?`)
    ) {
      return
    }
    revoke.mutate(event.userId, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['gift-history'] })
      },
    })
  }

  return (
    <button
      type="button"
      onClick={handleRevoke}
      disabled={revoke.isPending}
      className="rounded bg-red-50 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-50"
    >
      {revoke.isPending ? 'Revoking...' : 'Revoke'}
    </button>
  )
}

export const GiftHistoryPage = () => {
  const [page, setPage] = useState(1)
  const { data, isLoading, isError } = useGiftHistory(page)

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Gift History</h1>

      <div className="rounded-lg border border-gray-200 bg-white">
        {isLoading && <p className="p-6 text-sm text-gray-500">Loading...</p>}

        {isError && (
          <p className="p-6 text-sm text-red-600">
            Failed to load gift history.
          </p>
        )}

        {data && (
          <>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs font-medium uppercase text-gray-500">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Event</th>
                  <th className="px-4 py-3">Duration</th>
                  <th className="px-4 py-3">Admin</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {Array.isEmptyReadonlyArray(data.items) ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-gray-500"
                    >
                      No gift events yet.
                    </td>
                  </tr>
                ) : (
                  pipe(
                    data.items,
                    Array.map((event) => {
                      const meta = pipe(
                        Option.fromNullable(event.metadata),
                        Option.flatMap(decodeMetadata),
                        Option.getOrElse(() => emptyMetadata)
                      )
                      return (
                        <tr
                          key={event.id}
                          className="border-b border-gray-100 last:border-0"
                        >
                          <td className="px-4 py-3 text-gray-600">
                            {formatDate(event.createdAt)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-900">
                              {event.userName ?? 'No name'}
                            </div>
                            <div className="text-xs text-gray-500">
                              {event.userEmail}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <EventBadge eventType={event.eventType} />
                          </td>
                          <td className="px-4 py-3 text-gray-600">
                            {pipe(
                              Option.fromNullable(meta.duration),
                              Option.map((d) => durationLabel[d] ?? d),
                              Option.getOrElse(() => '—')
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">
                            {meta.giftedBy ?? meta.revokedBy ?? '—'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {event.eventType === 'subscription_gifted' && (
                              <RevokeButton event={event} />
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )
                )}
              </tbody>
            </table>

            {/* Pagination */}
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
