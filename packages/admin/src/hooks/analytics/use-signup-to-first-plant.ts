import type { SignupToFirstPlantResponse } from '@lily/shared/admin/analytics'
import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/api-client'

export const useSignupToFirstPlant = () =>
  useQuery({
    queryKey: ['analytics', 'signup-to-first-plant'],
    queryFn: () =>
      apiRequest<SignupToFirstPlantResponse>(
        '/api/admin/analytics/signup-to-first-plant'
      ),
    staleTime: 5 * 60 * 1000,
  })
