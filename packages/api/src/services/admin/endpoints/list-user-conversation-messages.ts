import type { SqlError } from '@effect/sql/SqlError'
import { ChatRepository } from '@lily/api/repositories/chat.repository'
import { type PaginationParams, parsePaginationParams } from '@lily/shared'
import {
  type ChatHistoryListResponse,
  ConversationNotFoundError,
} from '@lily/shared/ai-chat'
import { Effect } from 'effect'

// List the messages (user prompts + AI responses) of a single conversation for
// the admin detail page. The conversation must belong to the user in the path
// — otherwise we 404 rather than leak another user's chat.
export const listUserConversationMessages = (
  userId: string,
  conversationId: string,
  params: PaginationParams
): Effect.Effect<
  ChatHistoryListResponse,
  SqlError | ConversationNotFoundError,
  ChatRepository
> =>
  Effect.gen(function* () {
    const chatRepo = yield* ChatRepository

    const conversation = yield* chatRepo.findConversationById(conversationId)
    if (!conversation || conversation.userId !== userId) {
      return yield* new ConversationNotFoundError({ id: conversationId })
    }

    const { page, limit } = parsePaginationParams(params)
    return yield* chatRepo.findByConversationId({ conversationId, page, limit })
  }).pipe(
    Effect.withSpan('AdminService.listUserConversationMessages', {
      attributes: {
        'user.id': userId,
        'conversation.id': conversationId,
      },
    })
  )
