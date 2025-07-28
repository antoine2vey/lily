import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from '@effect/platform'
import { ChatMessage, ChatRequest, ChatResponse } from '@lily/shared/ai-chat'
import { DatabaseError } from '@lily/shared/errors/database'
import { PlantNotFoundError } from '@lily/shared/errors/plant'
import { Schema } from 'effect'

// Path parameter for plant ID
const plantIdParam = HttpApiSchema.param('plantId', Schema.String)

// Define the AI Chat API group - nested under plants
export const AIChatApi = HttpApiGroup.make('aiChat')
  .add(
    // POST /plants/:plantId/chat - Send text or image to AI Chat
    HttpApiEndpoint.post('sendChatMessage')`/plants/${plantIdParam}/chat`
      .setPayload(ChatRequest)
      .addSuccess(ChatResponse)
      .addError(DatabaseError, { status: 500 })
      .addError(PlantNotFoundError, { status: 404 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 400 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    // GET /plants/:plantId/chat/history - Fetch past chat messages
    HttpApiEndpoint.get('getChatHistory')`/plants/${plantIdParam}/chat/history`
      .addSuccess(Schema.Array(ChatMessage))
      .addError(DatabaseError, { status: 500 })
      .addError(PlantNotFoundError, { status: 404 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
