import type { TrialToPaidResponse } from '@lily/shared/admin/analytics'
import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/api-client'

export const useTrialToPaid = () =>
  useQuery({
    queryKey: ['analytics', 'trial-to-paid'],
    queryFn: () =>
      apiRequest<TrialToPaidResponse>('/api/admin/analytics/trial-to-paid'),
    staleTime: 5 * 60 * 1000,
  })
