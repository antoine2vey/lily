import {
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
  Multipart,
} from '@effect/platform'
import { Authentication } from '@lily/api/services/auth/middleware.types'
import { LimitExceededError, PaginationParams } from '@lily/shared'
import {
  PlantNotAuthorizedError,
  PlantNotFoundError,
} from '@lily/shared/errors/plant'
import {
  AIIdentifyResponse,
  EnhancedPlantCreateRequest,
  Plant,
  PlantDetail,
  PlantPhotosListResponse,
  PlantsListResponse,
  PlantUpdateRequest,
  PlantWaterRequest,
  WaterMultiplePlantsRequest,
  WaterMultiplePlantsResponse,
} from '@lily/shared/plant'
import { Schema } from 'effect'

// Path parameter for plant ID
const plantIdParam = HttpApiSchema.param('id', Schema.String)
const photoIdParam = HttpApiSchema.param('photoId', Schema.String)

// Query parameters for plants listing (extends base pagination)
export const PlantsQueryParams = Schema.Struct({
  ...PaginationParams.fields,
  filter: Schema.optionalWith(Schema.String, { default: () => 'all' }),
  sort: Schema.optionalWith(Schema.String, { default: () => 'added' }),
  roomId: Schema.optional(Schema.String),
  includeCaretaking: Schema.optionalWith(Schema.String, {
    default: () => 'false',
  }),
})

export type PlantsQueryParams = typeof PlantsQueryParams.Type

// Define the Plants API group
export const PlantsApi = HttpApiGroup.make('plants')
  .add(
    // GET /plants - List user's plants with filtering and pagination
    HttpApiEndpoint.get('getPlants')`/`
      .setUrlParams(PlantsQueryParams)
      .addSuccess(PlantsListResponse)
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    // POST /plants - Create a new plant (manual entry)
    HttpApiEndpoint.post('createPlant')`/`
      .setPayload(EnhancedPlantCreateRequest)
      .addSuccess(Plant, { status: 201 })
      .addError(LimitExceededError, { status: 403 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    // POST /plants/scan-card - Scan nursery card
    HttpApiEndpoint.post('scanCard')`/scan-card`
      .setPayload(
        HttpApiSchema.Multipart(
          Schema.Struct({
            images: Multipart.FilesSchema,
          })
        )
      )
      .addSuccess(AIIdentifyResponse)
      .addError(LimitExceededError, { status: 403 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 400 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    // POST /plants/scan-card-multiple - Scan multiple nursery cards at once
    HttpApiEndpoint.post('scanCardMultiple')`/scan-card-multiple`
      .setPayload(
        HttpApiSchema.Multipart(
          Schema.Struct({
            images: Multipart.FilesSchema,
          })
        )
      )
      .addSuccess(AIIdentifyResponse)
      .addError(LimitExceededError, { status: 403 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 400 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    // POST /plants/ai-identify - AI-identify species & care ratings
    HttpApiEndpoint.post('aiIdentify')`/ai-identify`
      .setPayload(
        HttpApiSchema.Multipart(
          Schema.Struct({
            images: Multipart.FilesSchema,
          })
        )
      )
      .addSuccess(AIIdentifyResponse)
      .addError(LimitExceededError, { status: 403 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 400 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    // POST /plants/water-multiple - Water multiple plants at once
    HttpApiEndpoint.post('waterMultiplePlants')`/water-multiple`
      .setPayload(WaterMultiplePlantsRequest)
      .addSuccess(WaterMultiplePlantsResponse)
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    // GET /plants/:id - Get plant by ID (includes recent photos)
    HttpApiEndpoint.get('getPlant')`/${plantIdParam}`
      .addSuccess(PlantDetail)
      .addError(PlantNotFoundError, { status: 404 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    // PUT /plants/:id - Update plant
    HttpApiEndpoint.put('updatePlant')`/${plantIdParam}`
      .setPayload(PlantUpdateRequest)
      .addSuccess(Plant)
      .addError(PlantNotFoundError, { status: 404 })
      .addError(PlantNotAuthorizedError, { status: 403 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    // DELETE /plants/:id - Delete plant
    HttpApiEndpoint.del('deletePlant')`/${plantIdParam}`
      .addSuccess(Plant)
      .addError(PlantNotFoundError, { status: 404 })
      .addError(PlantNotAuthorizedError, { status: 403 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    // GET /plants/:plantId/photos - List all photos for a plant
    HttpApiEndpoint.get('getPlantPhotos')`/${plantIdParam}/photos`
      .setUrlParams(PaginationParams)
      .addSuccess(PlantPhotosListResponse)
      .addError(PlantNotFoundError, { status: 404 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    // POST /plants/:plantId/photos - Upload a new plant photo
    HttpApiEndpoint.post('uploadPlantPhoto')`/${plantIdParam}/photos`
      .setPayload(
        HttpApiSchema.Multipart(
          Schema.Struct({
            files: Multipart.FilesSchema,
          })
        )
      )
      .addSuccess(Schema.Void, { status: 201 })
      .addError(PlantNotFoundError, { status: 404 })
      .addError(PlantNotAuthorizedError, { status: 403 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 400 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    // DELETE /plants/:plantId/photos/:photoId - Remove a plant photo
    HttpApiEndpoint.del(
      'deletePlantPhoto'
    )`/${plantIdParam}/photos/${photoIdParam}`
      .addSuccess(Schema.Void)
      .addError(PlantNotFoundError, { status: 404 })
      .addError(PlantNotAuthorizedError, { status: 403 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 404 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    // POST /plants/:id/water - Water plant
    HttpApiEndpoint.post('waterPlant')`/${plantIdParam}/water`
      .setPayload(PlantWaterRequest)
      .addSuccess(Plant)
      .addError(PlantNotFoundError, { status: 404 })
      .addError(PlantNotAuthorizedError, { status: 403 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    // POST /plants/:plantId/fertilize - "Fertilize Now" shortcut
    HttpApiEndpoint.post('fertilizePlant')`/${plantIdParam}/fertilize`
      .addSuccess(Plant)
      .addError(PlantNotFoundError, { status: 404 })
      .addError(PlantNotAuthorizedError, { status: 403 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .prefix('/plants')
  .middleware(Authentication)
