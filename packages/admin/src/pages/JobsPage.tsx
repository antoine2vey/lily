import { formatApiRelativeTime } from '@lily/shared'
import { Array, Match, Option, pipe } from 'effect'
import { Link } from 'react-router-dom'
import { StatusBadge } from '@/components/StatusBadge'
import type { IngestJob } from '@/hooks/use-ingest-jobs'
import { useIngestJobs } from '@/hooks/use-ingest-jobs'
import type { KnowledgeStats } from '@/hooks/use-knowledge-stats'
import { useKnowledgeStats } from '@/hooks/use-knowledge-stats'

const defaultStats: KnowledgeStats = {
  totalJobs: 0,
  totalDocuments: 0,
  totalChunks: 0,
  sourceBreakdown: [],
}

type TableState = 'loading' | 'empty' | 'data'

export const JobsPage = () => {
  const { data: jobsData, isLoading: jobsLoading } = useIngestJobs()
  const { data: statsData } = useKnowledgeStats()

  const jobs = pipe(
    Option.fromNullable(jobsData),
    Option.getOrElse((): ReadonlyArray<IngestJob> => [])
  )

  const stats = pipe(
    Option.fromNullable(statsData),
    Option.getOrElse(() => defaultStats)
  )

  const tableState: TableState = pipe(
    Match.value({
      loading: jobsLoading,
      empty: jobs.length === 0,
    }),
    Match.when({ loading: true }, () => 'loading' as const),
    Match.when({ empty: true }, () => 'empty' as const),
    Match.orElse(() => 'data' as const)
  )

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Knowledge Jobs</h1>
        <Link
          to="/jobs/new"
          className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
        >
          New Job
        </Link>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-4">
        {pipe(
          [
            { label: 'Total Jobs', value: stats.totalJobs },
            { label: 'Documents', value: stats.totalDocuments },
            { label: 'Chunks', value: stats.totalChunks },
          ] as const,
          Array.map((card) => (
            <div
              key={card.label}
              className="rounded-lg border border-gray-200 bg-white p-4"
            >
              <p className="text-sm text-gray-500">{card.label}</p>
              <p className="text-2xl font-semibold">{card.value}</p>
            </div>
          ))
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {pipe(
                [
                  'Status',
                  'Adapter',
                  'Documents',
                  'Chunks',
                  'Created',
                  'Error',
                ] as const,
                Array.map((header) => (
                  <th
                    key={header}
                    className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                  >
                    {header}
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {pipe(
              Match.value(tableState),
              Match.when('loading', () => (
                <tr key="loading">
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-sm text-gray-500"
                  >
                    Loading...
                  </td>
                </tr>
              )),
              Match.when('empty', () => (
                <tr key="empty">
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-sm text-gray-500"
                  >
                    No jobs found. Create one to get started.
                  </td>
                </tr>
              )),
              Match.when('data', () =>
                pipe(
                  jobs,
                  Array.map((job) => (
                    <tr key={job.id} className="hover:bg-gray-50">
                      <td className="whitespace-nowrap px-4 py-3">
                        <StatusBadge status={job.status} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                        {job.adapter}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                        {job.documentsFetched}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                        {job.chunksCreated}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                        {formatApiRelativeTime(job.createdAt, '\u2014')}
                      </td>
                      <td className="max-w-xs truncate px-4 py-3 text-sm">
                        {pipe(
                          Option.fromNullable(job.error),
                          Option.match({
                            onNone: () => (
                              <span className="text-gray-400">{'\u2014'}</span>
                            ),
                            onSome: (error) => (
                              <span className="text-red-600" title={error}>
                                {error}
                              </span>
                            ),
                          })
                        )}
                      </td>
                    </tr>
                  ))
                )
              ),
              Match.exhaustive
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
