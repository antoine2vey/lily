import { Authentication } from '@lily/api/services/auth/middleware.types'
import {
  CanopyNotFoundError,
  LimitExceededError,
  MovePlantScopeRequest,
  OpenAIError,
  PaginationParams,
  PlantInDelegationError,
  RoomNotFoundError,
} from '@lily/shared'
import {
  AlreadyCaredTodayError,
  FutureDateNotAllowedError,
  PlantAlreadyDeadError,
  PlantIsDeadError,
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
import { InvalidImageError } from '@lily/shared/services/file/image-upload'
import { Effect, Schema } from 'effect'
import { Multipart } from 'effect/http'
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api'

const plantIdParam = Schema.String.check(Schema.isGUID())
const photoIdParam = Schema.String.check(Schema.isGUID())

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
  includeCanopy: Schema.optional(Schema.String),
})

export type PlantsQueryParams = typeof PlantsQueryParams.Type

export const PlantsApi = HttpApiGroup.make('plants')
  .add(
    HttpApiEndpoint.get('getPlants', '/', {
      query: PlantsQueryParams,
      success: PlantsListResponse,
      error: Schema.Struct({ error: Schema.String }).pipe(
        HttpApiSchema.status(401)
      ),
    })
  )
  .add(
    HttpApiEndpoint.post('createPlant', '/', {
      payload: EnhancedPlantCreateRequest,
      success: Plant.pipe(HttpApiSchema.status(201)),
      error: [
        RoomNotFoundError,
        LimitExceededError,
        CanopyNotFoundError,
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .add(
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
        InvalidImageError,
        GCSUploadError.pipe(HttpApiSchema.status(500)),
        GCSConfigError.pipe(HttpApiSchema.status(500)),
        OpenAIError.pipe(HttpApiSchema.status(500)),
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .add(
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
        InvalidImageError,
        GCSUploadError.pipe(HttpApiSchema.status(500)),
        GCSConfigError.pipe(HttpApiSchema.status(500)),
        OpenAIError.pipe(HttpApiSchema.status(500)),
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .add(
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
        InvalidImageError,
        GCSUploadError.pipe(HttpApiSchema.status(500)),
        GCSConfigError.pipe(HttpApiSchema.status(500)),
        OpenAIError.pipe(HttpApiSchema.status(500)),
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .add(
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
        InvalidImageError,
        GCSUploadError.pipe(HttpApiSchema.status(500)),
        GCSConfigError.pipe(HttpApiSchema.status(500)),
        OpenAIError.pipe(HttpApiSchema.status(500)),
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .add(
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
    HttpApiEndpoint.put('updatePlant', '/:id', {
      params: { id: plantIdParam },
      payload: Schema.Struct({
        data: Schema.fromJsonString(PlantUpdateRequest),
        image: Multipart.SingleFileSchema.pipe(Schema.optional),
      }).pipe(HttpApiSchema.asMultipart()),
      success: Plant,
      error: [
        RoomNotFoundError,
        PlantNotFoundError,
        PlantNotAuthorizedError,
        PlantIsDeadError,
        InvalidImageError,
        GCSUploadError.pipe(HttpApiSchema.status(500)),
        GCSConfigError.pipe(HttpApiSchema.status(500)),
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .add(
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
    HttpApiEndpoint.post('uploadPlantPhoto', '/:id/photos', {
      params: { id: plantIdParam },
      payload: Schema.Struct({
        files: Multipart.FilesSchema,
      }).pipe(HttpApiSchema.asMultipart()),
      success: PlantPhotoUploadResponse.pipe(HttpApiSchema.status(201)),
      error: [
        PlantNotFoundError,
        PlantNotAuthorizedError,
        InvalidImageError,
        GCSUploadError.pipe(HttpApiSchema.status(500)),
        GCSConfigError.pipe(HttpApiSchema.status(500)),
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .add(
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
    HttpApiEndpoint.post('carePlant', '/:id/care', {
      params: { id: plantIdParam },
      payload: PlantCareRequest,
      success: Plant,
      error: [
        PlantNotFoundError,
        PlantNotAuthorizedError,
        FutureDateNotAllowedError,
        AlreadyCaredTodayError,
        PlantIsDeadError,
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .add(
    HttpApiEndpoint.patch('correctCareDates', '/:id/care-dates', {
      params: { id: plantIdParam },
      payload: PlantCorrectCareDatesRequest,
      success: Plant,
      error: [
        PlantNotFoundError,
        PlantNotAuthorizedError,
        FutureDateNotAllowedError,
        AlreadyCaredTodayError,
        PlantIsDeadError,
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .add(
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
  .add(
    HttpApiEndpoint.post('sharePlantWithCanopy', '/:id/share-with-canopy', {
      params: { id: plantIdParam },
      payload: MovePlantScopeRequest,
      success: Plant,
      error: [
        PlantNotFoundError,
        PlantNotAuthorizedError,
        CanopyNotFoundError,
        PlantInDelegationError,
        LimitExceededError,
        RoomNotFoundError,
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .add(
    HttpApiEndpoint.post('unsharePlant', '/:id/unshare', {
      params: { id: plantIdParam },
      payload: MovePlantScopeRequest,
      success: Plant,
      error: [
        PlantNotFoundError,
        PlantNotAuthorizedError,
        CanopyNotFoundError,
        LimitExceededError,
        RoomNotFoundError,
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .add(
    HttpApiEndpoint.put('mutePlant', '/:id/mute', {
      params: { id: plantIdParam },
      success: Schema.Void,
      error: [
        PlantNotFoundError,
        PlantNotAuthorizedError,
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .add(
    HttpApiEndpoint.delete('unmutePlant', '/:id/mute', {
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
