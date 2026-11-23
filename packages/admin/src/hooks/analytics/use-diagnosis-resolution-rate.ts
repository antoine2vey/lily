import { API_PREFIX } from '@lily/shared'
import type { DiagnosisResolutionRateResponse } from '@lily/shared/admin/analytics'
import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'

export const useDiagnosisResolutionRate = () =>
  useQuery({
    queryKey: queryKeys.analytics.metric('diagnosis-resolution-rate'),
    queryFn: () =>
      apiRequest<DiagnosisResolutionRateResponse>(
        `${API_PREFIX}/admin/analytics/diagnosis-resolution-rate`
      ),
    staleTime: 5 * 60 * 1000,
  })
