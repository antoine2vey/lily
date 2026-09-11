import { Option, pipe } from 'effect'
import { useEffectQuery } from '@/utils/client'

/** Accepted plans for the Care tab. */
export function useCarePlans() {
  return useEffectQuery('carePlans', 'getCarePlans', {
    urlParams: { status: 'accepted' },
  })
}

/** Every plan for one plant, any status — used by chat cards and plant detail. */
export function usePlantCarePlans(plantId: string | undefined) {
  return useEffectQuery(
    'carePlans',
    'getPlantCarePlans',
    {
      path: {
        plantId: pipe(
          Option.fromNullable(plantId),
          Option.getOrElse(() => '')
        ),
      },
    },
    { enabled: Boolean(plantId) }
  )
}
