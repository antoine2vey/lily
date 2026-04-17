import type { PaywallAttributionResponse } from '@lily/shared/admin/analytics'
import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/api-client'

export const usePaywallAttribution = () =>
  useQuery({
    queryKey: ['analytics', 'paywall-attribution'],
    queryFn: () =>
      apiRequest<PaywallAttributionResponse>(
        '/api/admin/analytics/paywall-attribution'
      ),
    staleTime: 5 * 60 * 1000,
  })
