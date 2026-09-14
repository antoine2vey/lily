import type { Plant } from '@lily/shared'
import { StaleTime } from '@lily/shared'
import { Array, Option, Order, pipe } from 'effect'
import { useMemo } from 'react'
import { useEffectQuery } from '@/utils/client'

// Most recent loss first; a missing diedAt (should not happen for this
// filter) sorts last rather than throwing.
const byDiedAtDesc: Order.Order<Plant> = Order.mapInput(
  Order.reverse(Order.Date),
  (plant) =>
    pipe(
      Option.fromNullable(plant.diedAt),
      Option.getOrElse(() => new Date(0))
    )
)

/** The user's cemetery: dead plants, newest loss first. */
export function useDeadPlants() {
  const query = useEffectQuery(
    'plants',
    'getPlants',
    {
      urlParams: {
        page: '1',
        limit: '100',
        filter: 'dead',
        sort: 'added',
        includeCaretaking: 'false',
      },
    },
    { staleTime: StaleTime.default }
  )

  const plants = useMemo(
    () =>
      pipe(
        Option.fromNullable(query.data?.items),
        Option.map((items) => Array.sort(items, byDiedAtDesc)),
        Option.getOrElse((): ReadonlyArray<Plant> => [])
      ),
    [query.data?.items]
  )

  const total = pipe(
    Option.fromNullable(query.data?.total),
    Option.getOrElse(() => 0)
  )

  return { ...query, plants, total }
}
