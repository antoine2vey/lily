import type { ActiveSubscribersByTierResponse } from '@lily/shared/admin/analytics'
import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/api-client'

export const useActiveSubscribersByTier = () =>
  useQuery({
    queryKey: ['analytics', 'active-subscribers-by-tier'],
    queryFn: () =>
      apiRequest<ActiveSubscribersByTierResponse>(
        '/api/admin/analytics/active-subscribers-by-tier'
      ),
    staleTime: 5 * 60 * 1000,
  })
