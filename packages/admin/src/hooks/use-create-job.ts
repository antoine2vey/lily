import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/lib/api-client'

export interface CreateIngestJobRequest {
  readonly adapter: string
  readonly config: {
    readonly type: 'reddit'
    readonly subreddits: ReadonlyArray<string>
    readonly sort?: 'hot' | 'top' | 'new'
    readonly timeFilter?: 'day' | 'week' | 'month' | 'year' | 'all'
    readonly limit?: number
  }
}

export const useCreateJob = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: CreateIngestJobRequest) =>
      apiRequest('/api/knowledge/jobs', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ingest-jobs'] })
      void queryClient.invalidateQueries({
        queryKey: ['knowledge-stats'],
      })
    },
  })
}
