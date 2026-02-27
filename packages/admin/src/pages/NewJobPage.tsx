import { Array, pipe, String } from 'effect'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCreateJob } from '@/hooks/use-create-job'

const sortOptions = ['hot', 'top', 'new'] as const
const timeFilterOptions = ['day', 'week', 'month', 'year', 'all'] as const

export const NewJobPage = () => {
  const navigate = useNavigate()
  const createJob = useCreateJob()

  const [adapterType, setAdapterType] = useState<'reddit' | 'web'>('reddit')

  // Reddit fields
  const [subreddits, setSubreddits] = useState('')
  const [sort, setSort] = useState<'hot' | 'top' | 'new'>('top')
  const [timeFilter, setTimeFilter] = useState<
    'day' | 'week' | 'month' | 'year' | 'all'
  >('year')
  const [limit, setLimit] = useState(25)

  // Web fields
  const [urls, setUrls] = useState('')

  const handleUrlPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text')

    const extracted = pipe(
      text.match(/https?:\/\/\S+/g) ?? [],
      Array.map((url) => url.replace(/[)>\]'".,;:]+$/, '')),
      Array.filter(String.isNonEmpty)
    )

    if (Array.isEmptyArray(extracted)) return

    setUrls((prev) => {
      const trimmed = String.trim(prev)
      return String.isNonEmpty(trimmed)
        ? `${trimmed}\n${Array.join(extracted, '\n')}`
        : Array.join(extracted, '\n')
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (adapterType === 'reddit') {
      const parsedSubreddits = pipe(
        subreddits,
        String.split(','),
        Array.map(String.trim),
        Array.filter(String.isNonEmpty)
      )

      if (parsedSubreddits.length === 0) return

      createJob.mutate(
        {
          adapter: 'reddit',
          config: {
            type: 'reddit',
            subreddits: parsedSubreddits,
            sort,
            timeFilter,
            limit,
          },
        },
        { onSuccess: () => navigate('/jobs') }
      )
    } else {
      const parsedUrls = pipe(
        urls,
        String.split('\n'),
        Array.map(String.trim),
        Array.filter(String.isNonEmpty)
      )

      if (parsedUrls.length === 0) return

      createJob.mutate(
        {
          adapter: 'web',
          config: {
            type: 'web',
            urls: parsedUrls,
          },
        },
        { onSuccess: () => navigate('/jobs') }
      )
    }
  }

  const isSubmitDisabled =
    (adapterType === 'reddit'
      ? pipe(subreddits, String.trim, String.isEmpty)
      : pipe(urls, String.trim, String.isEmpty)) || createJob.isPending

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">New Ingestion Job</h1>

      <form
        onSubmit={handleSubmit}
        className="max-w-lg space-y-5 rounded-lg border border-gray-200 bg-white p-6"
      >
        <div>
          <span className="block text-sm font-medium text-gray-700">
            Adapter
          </span>
          <div className="mt-1 flex gap-2">
            {pipe(
              ['reddit', 'web'] as const,
              Array.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setAdapterType(type)}
                  className={`rounded-md px-4 py-2 text-sm font-medium capitalize ${
                    adapterType === type
                      ? 'bg-primary-600 text-white'
                      : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {type}
                </button>
              ))
            )}
          </div>
        </div>

        {adapterType === 'reddit' && (
          <>
            <div>
              <label
                htmlFor="subreddits"
                className="block text-sm font-medium text-gray-700"
              >
                Subreddits
              </label>
              <input
                id="subreddits"
                type="text"
                value={subreddits}
                onChange={(e) => setSubreddits(e.target.value)}
                placeholder="houseplants, plantclinic, gardening"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
              <p className="mt-1 text-xs text-gray-400">
                Comma-separated list of subreddit names (without r/)
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor="sort"
                  className="block text-sm font-medium text-gray-700"
                >
                  Sort
                </label>
                <select
                  id="sort"
                  value={sort}
                  onChange={(e) =>
                    setSort(e.target.value as 'hot' | 'top' | 'new')
                  }
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  {pipe(
                    sortOptions,
                    Array.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <label
                  htmlFor="timeFilter"
                  className="block text-sm font-medium text-gray-700"
                >
                  Time Filter
                </label>
                <select
                  id="timeFilter"
                  value={timeFilter}
                  onChange={(e) =>
                    setTimeFilter(
                      e.target.value as
                        | 'day'
                        | 'week'
                        | 'month'
                        | 'year'
                        | 'all'
                    )
                  }
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  {pipe(
                    timeFilterOptions,
                    Array.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <label
                  htmlFor="limit"
                  className="block text-sm font-medium text-gray-700"
                >
                  Limit
                </label>
                <input
                  id="limit"
                  type="number"
                  min={1}
                  max={1000}
                  value={limit}
                  onChange={(e) => setLimit(Number(e.target.value))}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
            </div>
          </>
        )}

        {adapterType === 'web' && (
          <div>
            <label
              htmlFor="urls"
              className="block text-sm font-medium text-gray-700"
            >
              URLs
            </label>
            <textarea
              id="urls"
              value={urls}
              onChange={(e) => setUrls(e.target.value)}
              onPaste={handleUrlPaste}
              placeholder={
                'https://example.com/plant-care\nhttps://example.com/watering-guide'
              }
              rows={10}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
            <p className="mt-1 text-xs text-gray-400">
              One URL per line.{' '}
              {pipe(
                urls,
                String.split('\n'),
                Array.map(String.trim),
                Array.filter(String.isNonEmpty),
                (parsed) =>
                  parsed.length > 0
                    ? `${parsed.length} URL${parsed.length === 1 ? '' : 's'} entered.`
                    : null
              )}
            </p>
          </div>
        )}

        {createJob.isError && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
            {createJob.error.message}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={isSubmitDisabled}
            className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {createJob.isPending ? 'Creating...' : 'Create Job'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/jobs')}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
