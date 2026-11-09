import { API_PREFIX } from '@lily/shared'
import type { PaywallAttributionResponse } from '@lily/shared/admin/analytics'
import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/api-client'

export const usePaywallAttribution = () =>
  useQuery({
    queryKey: ['analytics', 'paywall-attribution'],
    queryFn: () =>
      apiRequest<PaywallAttributionResponse>(
        `${API_PREFIX}/admin/analytics/paywall-attribution`
      ),
    staleTime: 5 * 60 * 1000,
  })
