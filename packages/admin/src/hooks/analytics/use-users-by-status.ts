import type { UsersByStatusResponse } from '@lily/shared/admin/analytics'
import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/api-client'

export const useUsersByStatus = () =>
  useQuery({
    queryKey: ['analytics', 'users-by-status'],
    queryFn: () =>
      apiRequest<UsersByStatusResponse>('/api/admin/analytics/users-by-status'),
    staleTime: 5 * 60 * 1000,
  })
