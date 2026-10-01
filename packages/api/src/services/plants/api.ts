import { Authentication } from '@lily/api/services/auth/middleware.types'
import { LimitExceededError, OpenAIError, PaginationParams } from '@lily/shared'
import {
  AlreadyCaredTodayError,
  FutureDateNotAllowedError,
  PlantAlreadyDeadError,
  PlantNotAuthorizedError,
  PlantNotDeadError,
  PlantNotFoundError,
} from '@lily/shared/errors/plant'
import {
  AIIdentifyResponse,
  CareMultiplePlantsRequest,
  CareMultiplePlantsResponse,
  DetectResponse,
  EnhancedPlantCreateRequest,
  Plant,
  PlantCareRequest,
  PlantCorrectCareDatesRequest,
  PlantDeathRequest,
  PlantDetail,
  PlantPhotosListResponse,
  PlantPhotoUploadResponse,
  PlantsListResponse,
  PlantUpdateRequest,
} from '@lily/shared/plant'
import {
  FileTooLargeError,
  InvalidFileTypeError,
  MultipleFilesError,
  NoFilesError,
  TooManyFilesError,
} from '@lily/shared/services/file/fileservice'
import {
  GCSConfigError,
  GCSUploadError,
} from '@lily/shared/services/file/gcs-errors'
import { Schema } from 'effect'
import { Multipart } from 'effect/http'
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api'

// Path parameter for plant ID
const plantIdParam = HttpApiSchema.param(
  'id',
  Schema.String.check(Schema.isGUID())
)
const photoIdParam = HttpApiSchema.param(
  'photoId',
  Schema.String.check(Schema.isGUID())
)

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
        Schema.Struct({
          images: Multipart.FilesSchema,
          locale: Schema.optionalWith(Schema.String, { default: () => 'en' }),
        }).pipe(HttpApiSchema.asMultipart())
      )
      .addSuccess(AIIdentifyResponse)
      .addError(LimitExceededError, { status: 403 })
      .addError(MultipleFilesError, { status: 400 })
      .addError(NoFilesError, { status: 400 })
      .addError(GCSUploadError, { status: 500 })
      .addError(GCSConfigError, { status: 500 })
      .addError(OpenAIError, { status: 500 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    // POST /plants/scan-card-multiple - Scan multiple nursery cards at once
    HttpApiEndpoint.post('scanCardMultiple')`/scan-card-multiple`
      .setPayload(
        Schema.Struct({
          images: Multipart.FilesSchema,
          locale: Schema.optionalWith(Schema.String, { default: () => 'en' }),
        }).pipe(HttpApiSchema.asMultipart())
      )
      .addSuccess(AIIdentifyResponse)
      .addError(LimitExceededError, { status: 403 })
      .addError(NoFilesError, { status: 400 })
      .addError(TooManyFilesError, { status: 400 })
      .addError(InvalidFileTypeError, { status: 400 })
      .addError(FileTooLargeError, { status: 400 })
      .addError(GCSUploadError, { status: 500 })
      .addError(GCSConfigError, { status: 500 })
      .addError(OpenAIError, { status: 500 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    // POST /plants/detect - Unified plant/card detection
    HttpApiEndpoint.post('detect')`/detect`
      .setPayload(
        Schema.Struct({
          images: Multipart.FilesSchema,
          locale: Schema.optionalWith(Schema.String, {
            default: () => 'en',
          }),
        }).pipe(HttpApiSchema.asMultipart())
      )
      .addSuccess(DetectResponse)
      .addError(LimitExceededError, { status: 403 })
      .addError(MultipleFilesError, { status: 400 })
      .addError(NoFilesError, { status: 400 })
      .addError(GCSUploadError, { status: 500 })
      .addError(GCSConfigError, { status: 500 })
      .addError(OpenAIError, { status: 500 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    // POST /plants/ai-identify - AI-identify species & care ratings
    HttpApiEndpoint.post('aiIdentify')`/ai-identify`
      .setPayload(
        Schema.Struct({
          images: Multipart.FilesSchema,
          locale: Schema.optionalWith(Schema.String, { default: () => 'en' }),
        }).pipe(HttpApiSchema.asMultipart())
      )
      .addSuccess(AIIdentifyResponse)
      .addError(LimitExceededError, { status: 403 })
      .addError(MultipleFilesError, { status: 400 })
      .addError(NoFilesError, { status: 400 })
      .addError(GCSUploadError, { status: 500 })
      .addError(GCSConfigError, { status: 500 })
      .addError(OpenAIError, { status: 500 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    // POST /plants/ai-re-identify - Re-identify plant from existing image URLs
    HttpApiEndpoint.post('aiReIdentify')`/ai-re-identify`
      .setPayload(
        Schema.Struct({
          imageUrls: Schema.Array(Schema.String),
          locale: Schema.optionalWith(Schema.String, { default: () => 'en' }),
        })
      )
      .addSuccess(AIIdentifyResponse)
      .addError(OpenAIError, { status: 500 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    // POST /plants/care-multiple - Care for multiple plants at once (generic)
    HttpApiEndpoint.post('careMultiplePlants')`/care-multiple`
      .setPayload(CareMultiplePlantsRequest)
      .addSuccess(CareMultiplePlantsResponse)
      .addError(PlantNotFoundError, { status: 404 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    // GET /plants/:id - Get plant by ID (includes recent photos)
    HttpApiEndpoint.get('getPlant')`/${plantIdParam}`
      .addSuccess(PlantDetail)
      .addError(PlantNotFoundError, { status: 404 })
      .addError(PlantNotAuthorizedError, { status: 403 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    // PUT /plants/:id - Update plant (multipart: JSON data + optional image)
    HttpApiEndpoint.put('updatePlant')`/${plantIdParam}`
      .setPayload(
        Schema.Struct({
          data: Schema.fromJsonString(PlantUpdateRequest),
          image: Multipart.SingleFileSchema.pipe(Schema.optional),
        }).pipe(HttpApiSchema.asMultipart())
      )
      .addSuccess(Plant)
      .addError(PlantNotFoundError, { status: 404 })
      .addError(PlantNotAuthorizedError, { status: 403 })
      .addError(GCSUploadError, { status: 500 })
      .addError(GCSConfigError, { status: 500 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    // DELETE /plants/:id - Delete plant permanently (owner only)
    HttpApiEndpoint.delete('deletePlant')`/${plantIdParam}`
      .addSuccess(Plant)
      .addError(PlantNotFoundError, { status: 404 })
      .addError(PlantNotAuthorizedError, { status: 403 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    // POST /plants/:id/death - "Say goodbye": move the plant to the cemetery
    HttpApiEndpoint.post('markPlantDead')`/${plantIdParam}/death`
      .setPayload(PlantDeathRequest)
      .addSuccess(Plant)
      .addError(PlantNotFoundError, { status: 404 })
      .addError(PlantNotAuthorizedError, { status: 403 })
      .addError(PlantAlreadyDeadError, { status: 409 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    // DELETE /plants/:id/death - "Bring back": restore a plant from the cemetery
    HttpApiEndpoint.delete('revivePlant')`/${plantIdParam}/death`
      .addSuccess(Plant)
      .addError(PlantNotFoundError, { status: 404 })
      .addError(PlantNotAuthorizedError, { status: 403 })
      .addError(LimitExceededError, { status: 403 })
      .addError(PlantNotDeadError, { status: 409 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    // GET /plants/:plantId/photos - List all photos for a plant
    HttpApiEndpoint.get('getPlantPhotos')`/${plantIdParam}/photos`
      .setUrlParams(PaginationParams)
      .addSuccess(PlantPhotosListResponse)
      .addError(PlantNotFoundError, { status: 404 })
      .addError(PlantNotAuthorizedError, { status: 403 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    // POST /plants/:plantId/photos - Upload a new plant photo
    HttpApiEndpoint.post('uploadPlantPhoto')`/${plantIdParam}/photos`
      .setPayload(
        Schema.Struct({
          files: Multipart.FilesSchema,
        }).pipe(HttpApiSchema.asMultipart())
      )
      .addSuccess(PlantPhotoUploadResponse, { status: 201 })
      .addError(PlantNotFoundError, { status: 404 })
      .addError(PlantNotAuthorizedError, { status: 403 })
      .addError(GCSUploadError, { status: 500 })
      .addError(GCSConfigError, { status: 500 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    // DELETE /plants/:plantId/photos/:photoId - Remove a plant photo
    HttpApiEndpoint.delete(
      'deletePlantPhoto'
    )`/${plantIdParam}/photos/${photoIdParam}`
      .addSuccess(Schema.Void)
      .addError(PlantNotFoundError, { status: 404 })
      .addError(PlantNotAuthorizedError, { status: 403 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 404 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    // POST /plants/:id/care - Generic care action
    HttpApiEndpoint.post('carePlant')`/${plantIdParam}/care`
      .setPayload(PlantCareRequest)
      .addSuccess(Plant)
      .addError(PlantNotFoundError, { status: 404 })
      .addError(PlantNotAuthorizedError, { status: 403 })
      .addError(FutureDateNotAllowedError, { status: 400 })
      .addError(AlreadyCaredTodayError, { status: 409 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    // PATCH /plants/:id/care-dates - Correct care dates
    HttpApiEndpoint.patch('correctCareDates')`/${plantIdParam}/care-dates`
      .setPayload(PlantCorrectCareDatesRequest)
      .addSuccess(Plant)
      .addError(PlantNotFoundError, { status: 404 })
      .addError(PlantNotAuthorizedError, { status: 403 })
      .addError(FutureDateNotAllowedError, { status: 400 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    // POST /plants/:id/share - Notify that plant was shared
    HttpApiEndpoint.post('sharePlant')`/${plantIdParam}/share`
      .addSuccess(Schema.Void)
      .addError(PlantNotFoundError, { status: 404 })
      .addError(PlantNotAuthorizedError, { status: 403 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .prefix('/plants')
  .middleware(Authentication)
