import type { MrrEstimateResponse } from '@lily/shared/admin/analytics'
import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/api-client'

export const useMrrEstimate = () =>
  useQuery({
    queryKey: ['analytics', 'mrr-estimate'],
    queryFn: () =>
      apiRequest<MrrEstimateResponse>('/api/admin/analytics/mrr-estimate'),
    staleTime: 5 * 60 * 1000,
  })
