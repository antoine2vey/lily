import { useMutation } from '@tanstack/react-query'
import { apiRequest } from '@/lib/api-client'

export interface SearchKnowledgeRequest {
  readonly query: string
  readonly plantType?: string
  readonly limit?: number
  readonly minSimilarity?: number
}

export interface ChunkSearchResult {
  readonly id: string
  readonly content: string
  readonly source: string
  readonly sourceUrl?: string
  readonly plantType?: string
  readonly category?: string
  readonly similarity: number
}

export const useSearchKnowledge = () =>
  useMutation({
    mutationFn: (body: SearchKnowledgeRequest) =>
      apiRequest<ReadonlyArray<ChunkSearchResult>>('/api/knowledge/search', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  })
