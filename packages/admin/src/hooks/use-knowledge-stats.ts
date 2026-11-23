import { API_PREFIX } from '@lily/shared'
import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'

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
    queryKey: queryKeys.knowledgeStats,
    queryFn: () => apiRequest<KnowledgeStats>(`${API_PREFIX}/knowledge/stats`),
    refetchInterval: 10_000,
  })
