import { API_PREFIX } from '@lily/shared'
import type { PlantsPerUserDistributionResponse } from '@lily/shared/admin/analytics'
import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'

export const usePlantsPerUserDistribution = () =>
  useQuery({
    queryKey: queryKeys.analytics.metric('plants-per-user'),
    queryFn: () =>
      apiRequest<PlantsPerUserDistributionResponse>(
        `${API_PREFIX}/admin/analytics/plants-per-user-distribution`
      ),
    staleTime: 5 * 60 * 1000,
  })
