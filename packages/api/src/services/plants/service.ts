import { aiIdentify } from '@lily/api/services/plants/endpoints/ai-identify'
import { aiReIdentify } from '@lily/api/services/plants/endpoints/ai-re-identify'
import { careMultiplePlants } from '@lily/api/services/plants/endpoints/care-multiple-plants'
import { carePlant } from '@lily/api/services/plants/endpoints/care-plant'
import { correctCareDates } from '@lily/api/services/plants/endpoints/correct-care-dates'
import { createPlant } from '@lily/api/services/plants/endpoints/create-plant'
import { deletePlant } from '@lily/api/services/plants/endpoints/delete-plant'
import { deletePlantPhoto } from '@lily/api/services/plants/endpoints/delete-plant-photo'
import { findPlantById } from '@lily/api/services/plants/endpoints/find-plant-by-id'
import { findPlants } from '@lily/api/services/plants/endpoints/find-plants'
import { getPlantPhotos } from '@lily/api/services/plants/endpoints/get-plant-photos'
import { scanCard } from '@lily/api/services/plants/endpoints/scan-card'
import { scanCardMultiple } from '@lily/api/services/plants/endpoints/scan-card-multiple'
import { updatePlant } from '@lily/api/services/plants/endpoints/update-plant'
import { uploadPlantPhoto } from '@lily/api/services/plants/endpoints/upload-plant-photo'
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
      carePlant,
      careMultiplePlants,
      scanCard,
      scanCardMultiple,
      aiIdentify,
      aiReIdentify,
      getPlantPhotos,
      uploadPlantPhoto,
      deletePlantPhoto,
      correctCareDates,
    }),
  }
) {}
