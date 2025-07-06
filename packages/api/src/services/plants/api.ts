import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from '@effect/platform'
import { DatabaseError } from '@lily/shared/errors/database'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import {
  Plant,
  PlantCreateRequest,
  PlantUpdateRequest,
  PlantWaterRequest,
} from '@lily/shared/plant'
import { Schema } from 'effect'

// Path parameter for plant ID
const plantIdParam = HttpApiSchema.param('id', Schema.String)

// Path parameter for user ID
const userIdParam = HttpApiSchema.param('userId', Schema.String)

// Define the Plants API group
export const PlantsApi = HttpApiGroup.make('plants')
  .add(
    // GET /plants - List all plants
    HttpApiEndpoint.get('getPlants')`/`
      .addSuccess(Schema.Array(Plant))
      .addError(DatabaseError, { status: 500 })
  )
  .add(
    // GET /plants/:id - Get plant by ID
    HttpApiEndpoint.get('getPlant')`/${plantIdParam}`
      .addSuccess(Plant)
      .addError(DatabaseError, { status: 500 })
      .addError(PlantNotFoundError, { status: 404 })
  )
  .add(
    // GET /plants/user/:userId - Get plants by user ID
    HttpApiEndpoint.get('getPlantsByUser')`/user/${userIdParam}`
      .addSuccess(Schema.Array(Plant))
      .addError(DatabaseError, { status: 500 })
  )
  .add(
    // POST /plants - Create plant
    HttpApiEndpoint.post('createPlant')`/`
      .setPayload(PlantCreateRequest)
      .addSuccess(Plant, { status: 201 })
      .addError(DatabaseError, { status: 500 })
  )
  .add(
    // PUT /plants/:id - Update plant
    HttpApiEndpoint.put('updatePlant')`/${plantIdParam}`
      .setPayload(PlantUpdateRequest)
      .addSuccess(Plant)
      .addError(DatabaseError, { status: 500 })
      .addError(PlantNotFoundError, { status: 404 })
  )
  .add(
    // DELETE /plants/:id - Delete plant
    HttpApiEndpoint.del('deletePlant')`/${plantIdParam}`
      .addSuccess(Plant)
      .addError(DatabaseError, { status: 500 })
      .addError(PlantNotFoundError, { status: 404 })
  )
  .prefix('/plants')
  .add(
    // POST /plants/:id/water - Water plant
    HttpApiEndpoint.post('waterPlant')`/${plantIdParam}/water`
      .setPayload(PlantWaterRequest)
      .addSuccess(Plant)
      .addError(DatabaseError, { status: 500 })
      .addError(PlantNotFoundError, { status: 404 })
  )
