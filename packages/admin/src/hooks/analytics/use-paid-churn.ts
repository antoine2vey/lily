import { API_PREFIX } from '@lily/shared'
import type { PaidChurnResponse } from '@lily/shared/admin/analytics'
import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/api-client'

export const usePaidChurn = () =>
  useQuery({
    queryKey: ['analytics', 'paid-churn'],
    queryFn: () =>
      apiRequest<PaidChurnResponse>(`${API_PREFIX}/admin/analytics/paid-churn`),
    staleTime: 5 * 60 * 1000,
  })
