import { ChatRepository } from '@lily/api/repositories/chat.repository'
import { type PaginationParams, parsePaginationParams } from '@lily/shared'
import type { ChatConversationListResponse } from '@lily/shared/ai-chat'
import { Effect } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export const listUserConversations = (
  userId: string,
  params: PaginationParams
): Effect.Effect<ChatConversationListResponse, SqlError, ChatRepository> =>
  Effect.gen(function* () {
    const chatRepo = yield* ChatRepository
    const { page, limit } = parsePaginationParams(params)
    return yield* chatRepo.listConversations({ userId, page, limit })
  }).pipe(
    Effect.withSpan('AdminService.listUserConversations', {
      attributes: { 'user.id': userId },
    })
  )
