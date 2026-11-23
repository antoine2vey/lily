import { API_PREFIX } from '@lily/shared'
import type { UsersByStatusResponse } from '@lily/shared/admin/analytics'
import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'

export const useUsersByStatus = () =>
  useQuery({
    queryKey: queryKeys.analytics.metric('users-by-status'),
    queryFn: () =>
      apiRequest<UsersByStatusResponse>(
        `${API_PREFIX}/admin/analytics/users-by-status`
      ),
    staleTime: 5 * 60 * 1000,
  })
