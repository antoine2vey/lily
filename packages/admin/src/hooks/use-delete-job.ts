import { API_PREFIX } from '@lily/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/lib/api-client'

export const useDeleteJob = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) =>
      apiRequest(`${API_PREFIX}/knowledge/jobs/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ingest-jobs'] })
      void queryClient.invalidateQueries({ queryKey: ['knowledge-stats'] })
    },
  })
}
