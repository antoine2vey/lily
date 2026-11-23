import { API_PREFIX } from '@lily/shared'
import type { DauWauMauResponse } from '@lily/shared/admin/analytics'
import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'

export const useDauWauMau = () =>
  useQuery({
    queryKey: queryKeys.analytics.metric('dau-wau-mau'),
    queryFn: () =>
      apiRequest<DauWauMauResponse>(
        `${API_PREFIX}/admin/analytics/dau-wau-mau`
      ),
    staleTime: 5 * 60 * 1000,
  })
