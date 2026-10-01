import { Authentication } from '@lily/api/services/auth/middleware.types'
import { LimitExceededError, PaginationParams } from '@lily/shared'
import {
  ChatConversation,
  ChatConversationKind,
  ChatConversationListResponse,
  ChatHistoryListResponse,
  ConversationNotFoundError,
  CreateConversationRequest,
} from '@lily/shared/ai-chat'
import {
  PlantNotAuthorizedError,
  PlantNotFoundError,
} from '@lily/shared/errors/plant'
import {
  GCSConfigError,
  GCSUploadError,
} from '@lily/shared/services/file/gcs-errors'
import { Schema } from 'effect'
import { Multipart } from 'effect/http'
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api'

const conversationIdParam = HttpApiSchema.param(
  'conversationId',
  Schema.String.check(Schema.isGUID())
)

const StreamChatRequest = Schema.Struct({
  message: Schema.String,
  imageUrl: Schema.optional(Schema.String),
  imageKey: Schema.optional(Schema.String),
})

const ConversationListParams = Schema.Struct({
  ...PaginationParams.fields,
  kind: Schema.optional(ChatConversationKind),
})

export const AIChatApi = HttpApiGroup.make('aiChat')
  // ── Conversation-centric routes (new) ─────────────────────────────
  .add(
    HttpApiEndpoint.post('createConversation')`/chat/conversations`
      .setPayload(CreateConversationRequest)
      .addSuccess(ChatConversation)
      .addError(PlantNotFoundError, { status: 404 })
      .addError(PlantNotAuthorizedError, { status: 403 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 400 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    HttpApiEndpoint.get('listConversations')`/chat/conversations`
      .setUrlParams(ConversationListParams)
      .addSuccess(ChatConversationListResponse)
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    // Single conversation — the chat screen needs `kind`/`plantId` to scope
    // plant-bound cards (diagnoses, care plans) rendered in the history.
    HttpApiEndpoint.get(
      'getConversation'
    )`/chat/conversations/${conversationIdParam}`
      .addSuccess(ChatConversation)
      .addError(ConversationNotFoundError, { status: 404 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    HttpApiEndpoint.delete(
      'deleteConversation'
    )`/chat/conversations/${conversationIdParam}`
      .addError(ConversationNotFoundError, { status: 404 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    HttpApiEndpoint.get(
      'getConversationMessages'
    )`/chat/conversations/${conversationIdParam}/messages`
      .setUrlParams(PaginationParams)
      .addSuccess(ChatHistoryListResponse)
      .addError(ConversationNotFoundError, { status: 404 })
      .addError(GCSUploadError, { status: 500 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    HttpApiEndpoint.post(
      'streamConversationMessage'
    )`/chat/conversations/${conversationIdParam}/stream`
      .setPayload(StreamChatRequest)
      .addError(LimitExceededError, { status: 403 })
      .addError(ConversationNotFoundError, { status: 404 })
      .addError(PlantNotFoundError, { status: 404 })
      .addError(PlantNotAuthorizedError, { status: 403 })
      .addError(GCSUploadError, { status: 500 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 400 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    HttpApiEndpoint.post(
      'uploadConversationImage'
    )`/chat/conversations/${conversationIdParam}/upload`
      .setPayload(
        Schema.Struct({
          files: Multipart.FilesSchema,
        }).pipe(HttpApiSchema.asMultipart())
      )
      .addSuccess(
        Schema.Struct({
          imageUrl: Schema.String,
          imageKey: Schema.String,
        })
      )
      .addError(ConversationNotFoundError, { status: 404 })
      .addError(GCSUploadError, { status: 500 })
      .addError(GCSConfigError, { status: 500 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 400 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .middleware(Authentication)
