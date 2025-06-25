import { Database } from '@lily/api/services/database/service'
import { PlantRpcs } from '@lily/api/services/plants/requests'
import { PlantsService } from '@lily/api/services/plants/service'
import { Effect, Layer, Stream } from 'effect'

export const PlantsLive = PlantRpcs.toLayer(
  Effect.gen(function* () {
    const plantsService = yield* PlantsService

    return {
      PlantList: () => Stream.fromIterableEffect(plantsService.findPlants),
      PlantById: (cmd) => Stream.fromEffect(plantsService.findPlantById(cmd)),
      PlantByUserId: (cmd) =>
        Stream.fromIterableEffect(plantsService.findPlantsByUserId(cmd)),
      PlantCreate: (cmd) => plantsService.createPlant(cmd),
      PlantUpdate: (cmd) => plantsService.updatePlant(cmd),
      PlantDelete: (cmd) => plantsService.deletePlant(cmd),
      PlantWater: (cmd) => plantsService.waterPlant(cmd),
    }
  })
).pipe(
  // Provide the Database layer
  Layer.provide(Database.Default),
  Layer.provide(PlantsService.Default)
)
