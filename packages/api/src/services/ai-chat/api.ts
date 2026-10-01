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

const conversationIdParam = Schema.String.check(Schema.isGUID())

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
    HttpApiEndpoint.post('createConversation', '/chat/conversations', {
      payload: CreateConversationRequest,
      success: ChatConversation,
      error: [
        PlantNotFoundError,
        PlantNotAuthorizedError,
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(400)),
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .add(
    HttpApiEndpoint.get('listConversations', '/chat/conversations', {
      query: ConversationListParams,
      success: ChatConversationListResponse,
      error: Schema.Struct({ error: Schema.String }).pipe(
        HttpApiSchema.status(401)
      ),
    })
  )
  .add(
    // Single conversation — the chat screen needs `kind`/`plantId` to scope
    // plant-bound cards (diagnoses, care plans) rendered in the history.
    HttpApiEndpoint.get(
      'getConversation',
      '/chat/conversations/:conversationId',
      {
        params: { conversationId: conversationIdParam },
        success: ChatConversation,
        error: [
          ConversationNotFoundError.pipe(HttpApiSchema.status(404)),
          Schema.Struct({ error: Schema.String }).pipe(
            HttpApiSchema.status(401)
          ),
        ],
      }
    )
  )
  .add(
    HttpApiEndpoint.delete(
      'deleteConversation',
      '/chat/conversations/:conversationId',
      {
        params: { conversationId: conversationIdParam },
        error: [
          ConversationNotFoundError.pipe(HttpApiSchema.status(404)),
          Schema.Struct({ error: Schema.String }).pipe(
            HttpApiSchema.status(401)
          ),
        ],
      }
    )
  )
  .add(
    HttpApiEndpoint.get(
      'getConversationMessages',
      '/chat/conversations/:conversationId/messages',
      {
        params: { conversationId: conversationIdParam },
        query: PaginationParams,
        success: ChatHistoryListResponse,
        error: [
          ConversationNotFoundError.pipe(HttpApiSchema.status(404)),
          GCSUploadError.pipe(HttpApiSchema.status(500)),
          Schema.Struct({ error: Schema.String }).pipe(
            HttpApiSchema.status(401)
          ),
        ],
      }
    )
  )
  .add(
    HttpApiEndpoint.post(
      'streamConversationMessage',
      '/chat/conversations/:conversationId/stream',
      {
        params: { conversationId: conversationIdParam },
        payload: StreamChatRequest,
        error: [
          LimitExceededError,
          ConversationNotFoundError.pipe(HttpApiSchema.status(404)),
          PlantNotFoundError,
          PlantNotAuthorizedError,
          GCSUploadError.pipe(HttpApiSchema.status(500)),
          Schema.Struct({ error: Schema.String }).pipe(
            HttpApiSchema.status(400)
          ),
          Schema.Struct({ error: Schema.String }).pipe(
            HttpApiSchema.status(401)
          ),
        ],
      }
    )
  )
  .add(
    HttpApiEndpoint.post(
      'uploadConversationImage',
      '/chat/conversations/:conversationId/upload',
      {
        params: { conversationId: conversationIdParam },
        payload: Schema.Struct({
          files: Multipart.FilesSchema,
        }).pipe(HttpApiSchema.asMultipart()),
        success: Schema.Struct({
          imageUrl: Schema.String,
          imageKey: Schema.String,
        }),
        error: [
          ConversationNotFoundError.pipe(HttpApiSchema.status(404)),
          GCSUploadError.pipe(HttpApiSchema.status(500)),
          GCSConfigError.pipe(HttpApiSchema.status(500)),
          Schema.Struct({ error: Schema.String }).pipe(
            HttpApiSchema.status(400)
          ),
          Schema.Struct({ error: Schema.String }).pipe(
            HttpApiSchema.status(401)
          ),
        ],
      }
    )
  )
  .middleware(Authentication)
