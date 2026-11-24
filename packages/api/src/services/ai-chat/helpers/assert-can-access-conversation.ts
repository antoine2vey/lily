import {
  ChatRepository,
  type Conversation,
} from '@lily/api/repositories/chat.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { ConversationNotFoundError } from '@lily/shared/ai-chat'
import { Effect } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export const withConversationAuth = (
  conversationId: string
): Effect.Effect<
  Conversation,
  ConversationNotFoundError | SqlError,
  ChatRepository | CurrentUser
> =>
  Effect.gen(function* () {
    const chatRepo = yield* ChatRepository
    const { id: userId } = yield* CurrentUser
    const conversation = yield* chatRepo.findConversationById(conversationId)
    if (!conversation || conversation.userId !== userId) {
      return yield* new ConversationNotFoundError({ id: conversationId })
    }
    return conversation
  }).pipe(
    Effect.withSpan('withConversationAuth', {
      attributes: { 'conversation.id': conversationId },
    })
  )
