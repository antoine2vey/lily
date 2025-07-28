import { Effect } from 'effect'
import { aiIdentify } from './endpoints/ai-identify'
import { createPlant } from './endpoints/create-plant'
import { deletePlant } from './endpoints/delete-plant'
import { deletePlantPhoto } from './endpoints/delete-plant-photo'
import { fertilizePlant } from './endpoints/fertilize-plant'
import { findPlantById } from './endpoints/find-plant-by-id'
import { findPlants } from './endpoints/find-plants'
import { getPlantPhotos } from './endpoints/get-plant-photos'
import { scanCard } from './endpoints/scan-card'
import { updatePlant } from './endpoints/update-plant'
import { uploadPlantPhoto } from './endpoints/upload-plant-photo'
import { waterPlant } from './endpoints/water-plant'

// Plant service implementation
export class PlantsService extends Effect.Service<PlantsService>()(
  'PlantsService',
  {
    effect: Effect.succeed({
      findPlants,
      findPlantById,
      createPlant,
      updatePlant,
      deletePlant,
      waterPlant,
      scanCard,
      aiIdentify,
      getPlantPhotos,
      uploadPlantPhoto,
      deletePlantPhoto,
      fertilizePlant,
    }),
  }
) {}
