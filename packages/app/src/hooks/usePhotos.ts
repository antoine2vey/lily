import { StaleTime } from '@lily/shared'
import { useEffectQuery } from '@/utils/client'

interface UsePhotosParams {
  plantId: string
  page?: number
  limit?: number
}

/**
 * Hook to fetch plant photos with pagination
 */
export function usePhotos({ plantId, page = 1, limit = 20 }: UsePhotosParams) {
  return useEffectQuery(
    'plants',
    'getPlantPhotos',
    {
      path: { id: plantId },
      urlParams: {
        page: String(page),
        limit: String(limit),
      },
    },
    {
      enabled: !!plantId,
      staleTime: StaleTime.default,
    }
  )
}
