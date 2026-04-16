import { GIFT_DURATION_LABELS } from '@lily/shared/admin'
import { useQueryClient } from '@tanstack/react-query'
import { Array, Option, pipe } from 'effect'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  useCreateGiftCode,
  useGiftCode,
  useUpdateGiftCode,
} from '@/hooks/use-gift-codes'

const enLabels = pipe(
  Option.fromNullable(GIFT_DURATION_LABELS.en),
  Option.getOrElse(() => ({
    '7d': '7 Days',
    '1m': '1 Month',
    '1y': '1 Year',
    infinite: 'Lifetime',
  }))
)

const durationOptions = [
  { value: '7d', label: enLabels['7d'] },
  { value: '1m', label: enLabels['1m'] },
  { value: '1y', label: enLabels['1y'] },
  { value: 'infinite', label: enLabels.infinite },
]

const formatDate = (dateStr: string): string =>
  new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

export const GiftCodeFormPage = () => {
  const { id } = useParams<{ id: string }>()
  const isEdit = !!id
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: existingCode, isLoading } = useGiftCode(id ?? '')
  const createMutation = useCreateGiftCode()
  const updateMutation = useUpdateGiftCode()

  const [code, setCode] = useState('')
  const [duration, setDuration] = useState('1m')
  const [maxUsages, setMaxUsages] = useState(0)
  const [expiresAt, setExpiresAt] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (existingCode) {
      setCode(existingCode.code)
      setDuration(existingCode.duration)
      setMaxUsages(existingCode.maxUsages)
      setExpiresAt(
        existingCode.expiresAt
          ? new Date(existingCode.expiresAt).toISOString().slice(0, 16)
          : ''
      )
      setIsActive(existingCode.isActive)
    }
  }, [existingCode])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!code.trim()) {
      setError('Code is required')
      return
    }

    const onSuccess = () => {
      queryClient.invalidateQueries({ queryKey: ['gift-codes'] })
      navigate('/gift-codes')
    }

    const onError = (err: Error) => {
      setError(err.message || 'An error occurred')
    }

    if (isEdit && id) {
      updateMutation.mutate(
        {
          id,
          code: code.toUpperCase(),
          duration,
          maxUsages,
          isActive,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        },
        { onSuccess, onError }
      )
    } else {
      createMutation.mutate(
        {
          code: code.toUpperCase(),
          duration,
          maxUsages,
          ...(expiresAt
            ? { expiresAt: new Date(expiresAt).toISOString() }
            : {}),
        },
        { onSuccess, onError }
      )
    }
  }

  const isPending = createMutation.isPending || updateMutation.isPending

  if (isEdit && isLoading) {
    return <p className="text-sm text-gray-500">Loading...</p>
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">
        {isEdit ? 'Edit Gift Code' : 'Create Gift Code'}
      </h1>

      <form
        onSubmit={handleSubmit}
        className="max-w-lg space-y-4 rounded-lg border border-gray-200 bg-white p-6"
      >
        {error && (
          <p className="rounded bg-red-50 p-3 text-sm text-red-600">{error}</p>
        )}

        <div>
          <label
            htmlFor="code"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Code
          </label>
          <input
            id="code"
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="SPRING2026"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono uppercase focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>

        <div>
          <label
            htmlFor="duration"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Duration
          </label>
          <select
            id="duration"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          >
            {pipe(
              durationOptions,
              Array.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))
            )}
          </select>
        </div>

        <div>
          <label
            htmlFor="maxUsages"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Max Usages
            <span className="ml-1 text-xs text-gray-400">(0 = unlimited)</span>
          </label>
          <input
            id="maxUsages"
            type="number"
            min={0}
            value={maxUsages}
            onChange={(e) => setMaxUsages(Number(e.target.value))}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>

        <div>
          <label
            htmlFor="expiresAt"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Expires At
            <span className="ml-1 text-xs text-gray-400">(optional)</span>
          </label>
          <input
            id="expiresAt"
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>

        {isEdit && (
          <div className="flex items-center gap-2">
            <input
              id="isActive"
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <label
              htmlFor="isActive"
              className="text-sm font-medium text-gray-700"
            >
              Active
            </label>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {isPending
              ? 'Saving...'
              : isEdit
                ? 'Update Gift Code'
                : 'Create Gift Code'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/gift-codes')}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>

      {isEdit && existingCode && existingCode.redemptions.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-4 text-lg font-semibold">Redemptions</h2>
          <div className="rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs font-medium uppercase text-gray-500">
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Redeemed At</th>
                </tr>
              </thead>
              <tbody>
                {pipe(
                  existingCode.redemptions,
                  Array.map((redemption) => (
                    <tr
                      key={redemption.id}
                      className="border-b border-gray-100 last:border-0"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">
                          {redemption.userName ?? 'No name'}
                        </div>
                        <div className="text-xs text-gray-500">
                          {redemption.userEmail}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {formatDate(redemption.redeemedAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
