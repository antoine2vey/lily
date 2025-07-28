import type { PlantPhoto } from '@lily/shared/plant'
import { Effect } from 'effect'

export const getPlantPhotos = (_request: { plantId: string }) =>
  Effect.succeed([] as PlantPhoto[])
