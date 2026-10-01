import { Option, pipe } from 'effect'
import { useEffectQuery } from '@/utils/client'

/** Accepted plans for the Care tab. */
export function useCarePlans() {
  return useEffectQuery('carePlans', 'getCarePlans', {
    query: { status: 'accepted' },
  })
}

/** Every plan for one plant, any status — used by chat cards and plant detail. */
export function usePlantCarePlans(plantId: string | undefined) {
  return useEffectQuery(
    'carePlans',
    'getPlantCarePlans',
    {
      params: {
        plantId: pipe(
          Option.fromNullishOr(plantId),
          Option.getOrElse(() => '')
        ),
      },
    },
    { enabled: Boolean(plantId) }
  )
}
