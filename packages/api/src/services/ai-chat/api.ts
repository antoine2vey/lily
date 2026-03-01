import {
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
  Multipart,
} from '@effect/platform'
import { Authentication } from '@lily/api/services/auth/middleware.types'
import { LimitExceededError, PaginationParams } from '@lily/shared'
import { ChatHistoryListResponse } from '@lily/shared/ai-chat'
import {
  PlantNotAuthorizedError,
  PlantNotFoundError,
} from '@lily/shared/errors/plant'
import {
  GCSConfigError,
  GCSUploadError,
} from '@lily/shared/services/file/gcs-errors'
import { Schema } from 'effect'

// Path parameter for plant ID
const plantIdParam = HttpApiSchema.param('plantId', Schema.UUID)

// Request schema for streaming chat - only the new user message
const StreamChatRequest = Schema.Struct({
  message: Schema.String,
  imageUrl: Schema.optional(Schema.String),
  imageKey: Schema.optional(Schema.String),
})

// Define the AI Chat API group - nested under plants
export const AIChatApi = HttpApiGroup.make('aiChat')
  .add(
    // POST /plants/:plantId/chat/stream - Send text and stream AI response
    HttpApiEndpoint.post(
      'streamChatMessage'
    )`/plants/${plantIdParam}/chat/stream`
      .setPayload(StreamChatRequest)
      .addError(LimitExceededError, { status: 403 })
      .addError(PlantNotFoundError, { status: 404 })
      .addError(PlantNotAuthorizedError, { status: 403 })
      .addError(GCSUploadError, { status: 500 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 400 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    // POST /plants/:plantId/chat/upload - Upload image for chat
    HttpApiEndpoint.post('uploadChatImage')`/plants/${plantIdParam}/chat/upload`
      .setPayload(
        HttpApiSchema.Multipart(
          Schema.Struct({
            files: Multipart.FilesSchema,
          })
        )
      )
      .addSuccess(
        Schema.Struct({
          imageUrl: Schema.String,
          imageKey: Schema.String,
        })
      )
      .addError(PlantNotFoundError, { status: 404 })
      .addError(GCSUploadError, { status: 500 })
      .addError(GCSConfigError, { status: 500 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 400 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    // GET /plants/:plantId/chat/history - Fetch past chat messages
    HttpApiEndpoint.get('getChatHistory')`/plants/${plantIdParam}/chat/history`
      .setUrlParams(PaginationParams)
      .addSuccess(ChatHistoryListResponse)
      .addError(PlantNotFoundError, { status: 404 })
      .addError(GCSUploadError, { status: 500 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .middleware(Authentication)
