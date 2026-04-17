import type { DiagnosisResolutionRateResponse } from '@lily/shared/admin/analytics'
import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/api-client'

export const useDiagnosisResolutionRate = () =>
  useQuery({
    queryKey: ['analytics', 'diagnosis-resolution-rate'],
    queryFn: () =>
      apiRequest<DiagnosisResolutionRateResponse>(
        '/api/admin/analytics/diagnosis-resolution-rate'
      ),
    staleTime: 5 * 60 * 1000,
  })
