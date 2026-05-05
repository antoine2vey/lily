import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { createConversation } from '@lily/api/services/ai-chat/endpoints/create-conversation'
import { deleteConversation } from '@lily/api/services/ai-chat/endpoints/delete-conversation'
import { getChatHistory } from '@lily/api/services/ai-chat/endpoints/get-chat-history'
import { listConversations } from '@lily/api/services/ai-chat/endpoints/list-conversations'
import { streamChatMessage } from '@lily/api/services/ai-chat/endpoints/stream-chat-message'
import { uploadChatImage } from '@lily/api/services/ai-chat/endpoints/upload-chat-image'
import { withConversationAuth } from '@lily/api/services/ai-chat/helpers/assert-can-access-conversation'
import { withInfraErrorsAsDefect } from '@lily/api/services/helpers/error-handling'
import { parsePaginationParams } from '@lily/shared'
import { Effect } from 'effect'

export const AIChatApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'aiChat', (handlers) =>
    handlers
      // ── Conversation routes ────────────────────────────────────
      .handle('createConversation', ({ payload }) =>
        createConversation({
          kind: payload.kind,
          ...(payload.plantId !== undefined
            ? { plantId: payload.plantId }
            : {}),
          ...(payload.title !== undefined ? { title: payload.title } : {}),
        }).pipe(withInfraErrorsAsDefect)
      )
      .handle('listConversations', ({ urlParams }) =>
        listConversations({
          ...parsePaginationParams(urlParams),
          ...(urlParams.kind !== undefined ? { kind: urlParams.kind } : {}),
        }).pipe(withInfraErrorsAsDefect)
      )
      .handle('deleteConversation', ({ path: { conversationId } }) =>
        withConversationAuth(conversationId).pipe(
          Effect.flatMap(() => deleteConversation(conversationId)),
          withInfraErrorsAsDefect
        )
      )
      .handle(
        'getConversationMessages',
        ({ path: { conversationId }, urlParams }) =>
          withConversationAuth(conversationId).pipe(
            Effect.flatMap(() =>
              getChatHistory({
                conversationId,
                ...parsePaginationParams(urlParams),
              })
            ),
            withInfraErrorsAsDefect
          )
      )
      .handle(
        'streamConversationMessage',
        ({ path: { conversationId }, payload }) =>
          withConversationAuth(conversationId).pipe(
            Effect.flatMap((conversation) =>
              streamChatMessage(conversation, {
                message: payload.message,
                ...(payload.imageUrl !== undefined
                  ? { imageUrl: payload.imageUrl }
                  : {}),
                ...(payload.imageKey !== undefined
                  ? { imageKey: payload.imageKey }
                  : {}),
              })
            ),
            withInfraErrorsAsDefect
          )
      )
      .handle(
        'uploadConversationImage',
        ({ path: { conversationId }, payload: { files } }) =>
          withConversationAuth(conversationId).pipe(
            Effect.flatMap(() => uploadChatImage({ conversationId, files })),
            withInfraErrorsAsDefect
          )
      )
  )
