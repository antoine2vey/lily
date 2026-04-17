import type { DauWauMauResponse } from '@lily/shared/admin/analytics'
import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/api-client'

export const useDauWauMau = () =>
  useQuery({
    queryKey: ['analytics', 'dau-wau-mau'],
    queryFn: () =>
      apiRequest<DauWauMauResponse>('/api/admin/analytics/dau-wau-mau'),
    staleTime: 5 * 60 * 1000,
  })
