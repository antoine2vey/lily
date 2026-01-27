import { aiIdentify } from '@lily/api/services/plants/endpoints/ai-identify'
import { createPlant } from '@lily/api/services/plants/endpoints/create-plant'
import { deletePlant } from '@lily/api/services/plants/endpoints/delete-plant'
import { deletePlantPhoto } from '@lily/api/services/plants/endpoints/delete-plant-photo'
import { fertilizePlant } from '@lily/api/services/plants/endpoints/fertilize-plant'
import { findPlantById } from '@lily/api/services/plants/endpoints/find-plant-by-id'
import { findPlants } from '@lily/api/services/plants/endpoints/find-plants'
import { getPlantPhotos } from '@lily/api/services/plants/endpoints/get-plant-photos'
import { scanCard } from '@lily/api/services/plants/endpoints/scan-card'
import { updatePlant } from '@lily/api/services/plants/endpoints/update-plant'
import { uploadPlantPhoto } from '@lily/api/services/plants/endpoints/upload-plant-photo'
import { waterMultiplePlants } from '@lily/api/services/plants/endpoints/water-multiple-plants'
import { waterPlant } from '@lily/api/services/plants/endpoints/water-plant'
import { Effect } from 'effect'

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
      waterMultiplePlants,
      scanCard,
      aiIdentify,
      getPlantPhotos,
      uploadPlantPhoto,
      deletePlantPhoto,
      fertilizePlant,
    }),
  }
) {}
