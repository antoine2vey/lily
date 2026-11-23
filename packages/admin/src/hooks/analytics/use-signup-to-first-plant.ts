import { API_PREFIX } from '@lily/shared'
import type { SignupToFirstPlantResponse } from '@lily/shared/admin/analytics'
import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/api-client'
import { queryKeys } from '@/lib/query-keys'

export const useSignupToFirstPlant = () =>
  useQuery({
    queryKey: queryKeys.analytics.metric('signup-to-first-plant'),
    queryFn: () =>
      apiRequest<SignupToFirstPlantResponse>(
        `${API_PREFIX}/admin/analytics/signup-to-first-plant`
      ),
    staleTime: 5 * 60 * 1000,
  })
