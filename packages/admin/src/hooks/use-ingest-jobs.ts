import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/api-client'

export interface IngestJob {
  readonly id: string
  readonly adapter: string
  readonly config: unknown
  readonly status: 'pending' | 'in_progress' | 'completed' | 'failed'
  readonly documentsFetched: number
  readonly chunksCreated: number
  readonly cursor?: string
  readonly error?: string
  readonly createdAt: string
  readonly updatedAt: string
}

export const useIngestJobs = () =>
  useQuery({
    queryKey: ['ingest-jobs'],
    queryFn: () => apiRequest<ReadonlyArray<IngestJob>>('/api/knowledge/jobs'),
    refetchInterval: 5_000,
  })
