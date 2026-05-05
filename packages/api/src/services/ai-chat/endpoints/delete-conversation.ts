import type { SqlError } from '@effect/sql/SqlError'
import { ChatRepository } from '@lily/api/repositories/chat.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { Effect } from 'effect'

export const deleteConversation = (
  conversationId: string
): Effect.Effect<void, SqlError, ChatRepository | CurrentUser> =>
  Effect.gen(function* () {
    const chatRepo = yield* ChatRepository
    const { id: userId } = yield* CurrentUser
    yield* chatRepo.deleteConversation({ id: conversationId, userId })
  }).pipe(Effect.withSpan('AIChatService.deleteConversation'))
