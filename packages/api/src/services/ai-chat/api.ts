import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from '@effect/platform'
import { Authentication } from '@lily/api/services/auth/middleware.types'
import { LimitExceededError, PaginationParams } from '@lily/shared'
import {
  ChatHistoryListResponse,
  ChatRequest,
  ChatResponse,
} from '@lily/shared/ai-chat'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import { Schema } from 'effect'

// Path parameter for plant ID
const plantIdParam = HttpApiSchema.param('plantId', Schema.String)

// Request schema for streaming chat - only the new user message
const StreamChatRequest = Schema.Struct({
  message: Schema.String,
})

// Define the AI Chat API group - nested under plants
export const AIChatApi = HttpApiGroup.make('aiChat')
  .add(
    // POST /plants/:plantId/chat - Send text or image to AI Chat (non-streaming)
    HttpApiEndpoint.post('sendChatMessage')`/plants/${plantIdParam}/chat`
      .setPayload(ChatRequest)
      .addSuccess(ChatResponse)
      .addError(LimitExceededError, { status: 403 })
      .addError(PlantNotFoundError, { status: 404 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 400 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    // POST /plants/:plantId/chat/stream - Send text and stream AI response
    HttpApiEndpoint.post(
      'streamChatMessage'
    )`/plants/${plantIdParam}/chat/stream`
      .setPayload(StreamChatRequest)
      .addError(LimitExceededError, { status: 403 })
      .addError(PlantNotFoundError, { status: 404 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 400 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    // GET /plants/:plantId/chat/history - Fetch past chat messages
    HttpApiEndpoint.get('getChatHistory')`/plants/${plantIdParam}/chat/history`
      .setUrlParams(PaginationParams)
      .addSuccess(ChatHistoryListResponse)
      .addError(PlantNotFoundError, { status: 404 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .middleware(Authentication)
