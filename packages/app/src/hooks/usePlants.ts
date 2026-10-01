import { StaleTime } from '@lily/shared'
import { Option, pipe } from 'effect'
import { useEffectQuery } from '@/utils/client'

interface PlantsParams {
  page?: string
  limit?: string
  filter?: string
  sort?: string
  includeCaretaking?: string
}

export function usePlants(params?: PlantsParams) {
  return useEffectQuery(
    'plants',
    'getPlants',
    {
      urlParams: {
        page: pipe(
          Option.fromNullishOr(params?.page),
          Option.getOrElse(() => '1')
        ),
        limit: pipe(
          Option.fromNullishOr(params?.limit),
          Option.getOrElse(() => '20')
        ),
        filter: pipe(
          Option.fromNullishOr(params?.filter),
          Option.getOrElse(() => 'all')
        ),
        sort: pipe(
          Option.fromNullishOr(params?.sort),
          Option.getOrElse(() => 'added')
        ),
        includeCaretaking: pipe(
          Option.fromNullishOr(params?.includeCaretaking),
          Option.getOrElse(() => 'false')
        ),
      },
    },
    {
      staleTime: StaleTime.default,
    }
  )
}
