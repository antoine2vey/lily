import { API_PREFIX } from '@lily/shared'
import type { MrrEstimateResponse } from '@lily/shared/admin/analytics'
import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/api-client'

export const useMrrEstimate = () =>
  useQuery({
    queryKey: ['analytics', 'mrr-estimate'],
    queryFn: () =>
      apiRequest<MrrEstimateResponse>(
        `${API_PREFIX}/admin/analytics/mrr-estimate`
      ),
    staleTime: 5 * 60 * 1000,
  })
