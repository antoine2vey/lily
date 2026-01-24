import { StaleTime } from '@lily/shared'
import { useEffectQuery } from '@/utils/client'

interface PlantsParams {
  page?: string
  limit?: string
  filter?: string
  sort?: string
}

export function usePlants(params?: PlantsParams) {
  return useEffectQuery(
    'plants',
    'getPlants',
    {
      urlParams: {
        page: params?.page ?? '1',
        limit: params?.limit ?? '20',
        filter: params?.filter ?? 'all',
        sort: params?.sort ?? 'added',
      },
    },
    {
      staleTime: StaleTime.default,
    }
  )
}
