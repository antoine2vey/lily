import type { SqlError } from '@effect/sql/SqlError'
import { ChatRepository } from '@lily/api/repositories/chat.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import type { ChatConversation } from '@lily/shared/ai-chat'
import { ConversationNotFoundError } from '@lily/shared/ai-chat'
import { Effect } from 'effect'

/**
 * Resolve a conversation by id and verify the current user owns it.
 * Returns the conversation as a typed `ChatConversation` so callers
 * never need to re-fetch.
 */
export const withConversationAuth = (
  conversationId: string
): Effect.Effect<
  ChatConversation,
  ConversationNotFoundError | SqlError,
  ChatRepository | CurrentUser
> =>
  Effect.gen(function* () {
    const chatRepo = yield* ChatRepository
    const { id: userId } = yield* CurrentUser
    const row = yield* chatRepo.findConversationById(conversationId)
    if (!row || row.userId !== userId) {
      return yield* new ConversationNotFoundError({ id: conversationId })
    }
    return {
      id: row.id,
      userId: row.userId,
      kind: row.kind as ChatConversation['kind'],
      ...(row.plantId ? { plantId: row.plantId } : {}),
      ...(row.title ? { title: row.title } : {}),
      createdAt: row.createdAt,
      lastMessageAt: row.lastMessageAt,
    }
  }).pipe(
    Effect.withSpan('withConversationAuth', {
      attributes: { 'conversation.id': conversationId },
    })
  )
