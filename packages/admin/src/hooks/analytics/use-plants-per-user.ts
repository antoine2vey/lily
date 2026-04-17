import type { PlantsPerUserDistributionResponse } from '@lily/shared/admin/analytics'
import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/api-client'

export const usePlantsPerUserDistribution = () =>
  useQuery({
    queryKey: ['analytics', 'plants-per-user'],
    queryFn: () =>
      apiRequest<PlantsPerUserDistributionResponse>(
        '/api/admin/analytics/plants-per-user-distribution'
      ),
    staleTime: 5 * 60 * 1000,
  })
