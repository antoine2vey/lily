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
import { Effect, Schema } from 'effect'
import { Multipart } from 'effect/http'
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api'

// Path parameter for plant ID
const plantIdParam = Schema.String.check(Schema.isGUID())
const photoIdParam = Schema.String.check(Schema.isGUID())

// Query parameters for plants listing (extends base pagination)
export const PlantsQueryParams = Schema.Struct({
  ...PaginationParams.fields,
  filter: Schema.String.pipe(
    Schema.withDecodingDefaultType(Effect.succeed('all')),
    Schema.withConstructorDefault(Effect.succeed('all'))
  ),
  sort: Schema.String.pipe(
    Schema.withDecodingDefaultType(Effect.succeed('added')),
    Schema.withConstructorDefault(Effect.succeed('added'))
  ),
  roomId: Schema.optional(Schema.String),
  includeCaretaking: Schema.String.pipe(
    Schema.withDecodingDefaultType(Effect.succeed('false')),
    Schema.withConstructorDefault(Effect.succeed('false'))
  ),
})

export type PlantsQueryParams = typeof PlantsQueryParams.Type

// Define the Plants API group
export const PlantsApi = HttpApiGroup.make('plants')
  .add(
    // GET /plants - List user's plants with filtering and pagination
    HttpApiEndpoint.get('getPlants', '/', {
      query: PlantsQueryParams,
      success: PlantsListResponse,
      error: Schema.Struct({ error: Schema.String }).pipe(
        HttpApiSchema.status(401)
      ),
    })
  )
  .add(
    // POST /plants - Create a new plant (manual entry)
    HttpApiEndpoint.post('createPlant', '/', {
      payload: EnhancedPlantCreateRequest,
      success: Plant.pipe(HttpApiSchema.status(201)),
      error: [
        LimitExceededError,
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .add(
    // POST /plants/scan-card - Scan nursery card
    HttpApiEndpoint.post('scanCard', '/scan-card', {
      payload: Schema.Struct({
        images: Multipart.FilesSchema,
        locale: Schema.String.pipe(
          Schema.withDecodingDefaultType(Effect.succeed('en')),
          Schema.withConstructorDefault(Effect.succeed('en'))
        ),
      }).pipe(HttpApiSchema.asMultipart()),
      success: AIIdentifyResponse,
      error: [
        LimitExceededError,
        MultipleFilesError.pipe(HttpApiSchema.status(400)),
        NoFilesError.pipe(HttpApiSchema.status(400)),
        GCSUploadError.pipe(HttpApiSchema.status(500)),
        GCSConfigError.pipe(HttpApiSchema.status(500)),
        OpenAIError.pipe(HttpApiSchema.status(500)),
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .add(
    // POST /plants/scan-card-multiple - Scan multiple nursery cards at once
    HttpApiEndpoint.post('scanCardMultiple', '/scan-card-multiple', {
      payload: Schema.Struct({
        images: Multipart.FilesSchema,
        locale: Schema.String.pipe(
          Schema.withDecodingDefaultType(Effect.succeed('en')),
          Schema.withConstructorDefault(Effect.succeed('en'))
        ),
      }).pipe(HttpApiSchema.asMultipart()),
      success: AIIdentifyResponse,
      error: [
        LimitExceededError,
        NoFilesError.pipe(HttpApiSchema.status(400)),
        TooManyFilesError.pipe(HttpApiSchema.status(400)),
        InvalidFileTypeError.pipe(HttpApiSchema.status(400)),
        FileTooLargeError.pipe(HttpApiSchema.status(400)),
        GCSUploadError.pipe(HttpApiSchema.status(500)),
        GCSConfigError.pipe(HttpApiSchema.status(500)),
        OpenAIError.pipe(HttpApiSchema.status(500)),
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .add(
    // POST /plants/detect - Unified plant/card detection
    HttpApiEndpoint.post('detect', '/detect', {
      payload: Schema.Struct({
        images: Multipart.FilesSchema,
        locale: Schema.String.pipe(
          Schema.withDecodingDefaultType(Effect.succeed('en')),
          Schema.withConstructorDefault(Effect.succeed('en'))
        ),
      }).pipe(HttpApiSchema.asMultipart()),
      success: DetectResponse,
      error: [
        LimitExceededError,
        MultipleFilesError.pipe(HttpApiSchema.status(400)),
        NoFilesError.pipe(HttpApiSchema.status(400)),
        GCSUploadError.pipe(HttpApiSchema.status(500)),
        GCSConfigError.pipe(HttpApiSchema.status(500)),
        OpenAIError.pipe(HttpApiSchema.status(500)),
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .add(
    // POST /plants/ai-identify - AI-identify species & care ratings
    HttpApiEndpoint.post('aiIdentify', '/ai-identify', {
      payload: Schema.Struct({
        images: Multipart.FilesSchema,
        locale: Schema.String.pipe(
          Schema.withDecodingDefaultType(Effect.succeed('en')),
          Schema.withConstructorDefault(Effect.succeed('en'))
        ),
      }).pipe(HttpApiSchema.asMultipart()),
      success: AIIdentifyResponse,
      error: [
        LimitExceededError,
        MultipleFilesError.pipe(HttpApiSchema.status(400)),
        NoFilesError.pipe(HttpApiSchema.status(400)),
        GCSUploadError.pipe(HttpApiSchema.status(500)),
        GCSConfigError.pipe(HttpApiSchema.status(500)),
        OpenAIError.pipe(HttpApiSchema.status(500)),
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .add(
    // POST /plants/ai-re-identify - Re-identify plant from existing image URLs
    HttpApiEndpoint.post('aiReIdentify', '/ai-re-identify', {
      payload: Schema.Struct({
        imageUrls: Schema.Array(Schema.String),
        locale: Schema.String.pipe(
          Schema.withDecodingDefaultType(Effect.succeed('en')),
          Schema.withConstructorDefault(Effect.succeed('en'))
        ),
      }),
      success: AIIdentifyResponse,
      error: [
        OpenAIError.pipe(HttpApiSchema.status(500)),
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .add(
    // POST /plants/care-multiple - Care for multiple plants at once (generic)
    HttpApiEndpoint.post('careMultiplePlants', '/care-multiple', {
      payload: CareMultiplePlantsRequest,
      success: CareMultiplePlantsResponse,
      error: [
        PlantNotFoundError,
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .add(
    // GET /plants/:id - Get plant by ID (includes recent photos)
    HttpApiEndpoint.get('getPlant', '/:id', {
      params: { id: plantIdParam },
      success: PlantDetail,
      error: [
        PlantNotFoundError,
        PlantNotAuthorizedError,
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .add(
    // PUT /plants/:id - Update plant (multipart: JSON data + optional image)
    HttpApiEndpoint.put('updatePlant', '/:id', {
      params: { id: plantIdParam },
      payload: Schema.Struct({
        data: Schema.fromJsonString(PlantUpdateRequest),
        image: Multipart.SingleFileSchema.pipe(Schema.optional),
      }).pipe(HttpApiSchema.asMultipart()),
      success: Plant,
      error: [
        PlantNotFoundError,
        PlantNotAuthorizedError,
        GCSUploadError.pipe(HttpApiSchema.status(500)),
        GCSConfigError.pipe(HttpApiSchema.status(500)),
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .add(
    // DELETE /plants/:id - Delete plant permanently (owner only)
    HttpApiEndpoint.delete('deletePlant', '/:id', {
      params: { id: plantIdParam },
      success: Plant,
      error: [
        PlantNotFoundError,
        PlantNotAuthorizedError,
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .add(
    // POST /plants/:id/death - "Say goodbye": move the plant to the cemetery
    HttpApiEndpoint.post('markPlantDead', '/:id/death', {
      params: { id: plantIdParam },
      payload: PlantDeathRequest,
      success: Plant,
      error: [
        PlantNotFoundError,
        PlantNotAuthorizedError,
        PlantAlreadyDeadError,
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .add(
    // DELETE /plants/:id/death - "Bring back": restore a plant from the cemetery
    HttpApiEndpoint.delete('revivePlant', '/:id/death', {
      params: { id: plantIdParam },
      success: Plant,
      error: [
        PlantNotFoundError,
        PlantNotAuthorizedError,
        LimitExceededError,
        PlantNotDeadError,
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .add(
    // GET /plants/:plantId/photos - List all photos for a plant
    HttpApiEndpoint.get('getPlantPhotos', '/:id/photos', {
      params: { id: plantIdParam },
      query: PaginationParams,
      success: PlantPhotosListResponse,
      error: [
        PlantNotFoundError,
        PlantNotAuthorizedError,
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .add(
    // POST /plants/:plantId/photos - Upload a new plant photo
    HttpApiEndpoint.post('uploadPlantPhoto', '/:id/photos', {
      params: { id: plantIdParam },
      payload: Schema.Struct({
        files: Multipart.FilesSchema,
      }).pipe(HttpApiSchema.asMultipart()),
      success: PlantPhotoUploadResponse.pipe(HttpApiSchema.status(201)),
      error: [
        PlantNotFoundError,
        PlantNotAuthorizedError,
        GCSUploadError.pipe(HttpApiSchema.status(500)),
        GCSConfigError.pipe(HttpApiSchema.status(500)),
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .add(
    // DELETE /plants/:plantId/photos/:photoId - Remove a plant photo
    HttpApiEndpoint.delete('deletePlantPhoto', '/:id/photos/:photoId', {
      params: { id: plantIdParam, photoId: photoIdParam },
      success: Schema.Void,
      error: [
        PlantNotFoundError,
        PlantNotAuthorizedError,
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(404)),
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .add(
    // POST /plants/:id/care - Generic care action
    HttpApiEndpoint.post('carePlant', '/:id/care', {
      params: { id: plantIdParam },
      payload: PlantCareRequest,
      success: Plant,
      error: [
        PlantNotFoundError,
        PlantNotAuthorizedError,
        FutureDateNotAllowedError,
        AlreadyCaredTodayError,
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .add(
    // PATCH /plants/:id/care-dates - Correct care dates
    HttpApiEndpoint.patch('correctCareDates', '/:id/care-dates', {
      params: { id: plantIdParam },
      payload: PlantCorrectCareDatesRequest,
      success: Plant,
      error: [
        PlantNotFoundError,
        PlantNotAuthorizedError,
        FutureDateNotAllowedError,
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .add(
    // POST /plants/:id/share - Notify that plant was shared
    HttpApiEndpoint.post('sharePlant', '/:id/share', {
      params: { id: plantIdParam },
      success: Schema.Void,
      error: [
        PlantNotFoundError,
        PlantNotAuthorizedError,
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .prefix('/plants')
  .middleware(Authentication)
