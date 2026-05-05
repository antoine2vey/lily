import type { SqlError } from '@effect/sql/SqlError'
import { ChatRepository } from '@lily/api/repositories/chat.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import type {
  ChatConversationKind,
  ChatConversationListResponse,
} from '@lily/shared/ai-chat'
import { Effect } from 'effect'

export const listConversations = (params: {
  kind?: ChatConversationKind
  page?: number
  limit?: number
}): Effect.Effect<
  ChatConversationListResponse,
  SqlError,
  ChatRepository | CurrentUser
> =>
  Effect.gen(function* () {
    const chatRepo = yield* ChatRepository
    const { id: userId } = yield* CurrentUser
    return yield* chatRepo.listConversations({
      userId,
      ...(params.kind !== undefined ? { kind: params.kind } : {}),
      ...(params.page !== undefined ? { page: params.page } : {}),
      ...(params.limit !== undefined ? { limit: params.limit } : {}),
    })
  }).pipe(Effect.withSpan('AIChatService.listConversations'))
