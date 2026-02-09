import { StaleTime } from '@lily/shared'
import { Option, pipe } from 'effect'
import { useEffectQuery } from 'src/utils/client'

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
        page: pipe(
          Option.fromNullable(params?.page),
          Option.getOrElse(() => '1')
        ),
        limit: pipe(
          Option.fromNullable(params?.limit),
          Option.getOrElse(() => '20')
        ),
        filter: pipe(
          Option.fromNullable(params?.filter),
          Option.getOrElse(() => 'all')
        ),
        sort: pipe(
          Option.fromNullable(params?.sort),
          Option.getOrElse(() => 'added')
        ),
      },
    },
    {
      staleTime: StaleTime.default,
    }
  )
}
