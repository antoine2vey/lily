import type { SqlError } from '@effect/sql/SqlError'
import { ChatRepository } from '@lily/api/repositories/chat.repository'
import { resolveImageUrls } from '@lily/api/services/ai-chat/resolve-image-urls'
import type { CurrentUser } from '@lily/api/services/auth/middleware.types'
import type { ChatHistoryListResponse } from '@lily/shared/ai-chat'
import type { GCSService } from '@lily/shared/services/file/gcs'
import type { GCSUploadError } from '@lily/shared/services/file/gcs-errors'
import { Effect } from 'effect'

export const getChatHistory = (params: {
  conversationId: string
  page?: number
  limit?: number
}): Effect.Effect<
  ChatHistoryListResponse,
  SqlError | GCSUploadError,
  ChatRepository | CurrentUser | GCSService
> =>
  Effect.gen(function* () {
    const chatRepo = yield* ChatRepository

    const result = yield* chatRepo.findByConversationId({
      conversationId: params.conversationId,
      ...(params.page !== undefined && { page: params.page }),
      ...(params.limit !== undefined && { limit: params.limit }),
    })

    // Resolve any raw GCS keys to signed URLs (batch, parallel)
    const resolvedItems = yield* resolveImageUrls(result.items)

    return { ...result, items: resolvedItems }
  }).pipe(
    Effect.withSpan('AIChatService.getChatHistory', {
      attributes: { 'conversation.id': params.conversationId },
    })
  )
