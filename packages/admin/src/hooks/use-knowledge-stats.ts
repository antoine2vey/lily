import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/api-client'

export interface KnowledgeStats {
  readonly totalChunks: number
  readonly totalDocuments: number
  readonly totalJobs: number
  readonly sourceBreakdown: ReadonlyArray<{
    readonly source: string
    readonly count: number
  }>
}

export const useKnowledgeStats = () =>
  useQuery({
    queryKey: ['knowledge-stats'],
    queryFn: () => apiRequest<KnowledgeStats>('/api/knowledge/stats'),
    refetchInterval: 10_000,
  })
