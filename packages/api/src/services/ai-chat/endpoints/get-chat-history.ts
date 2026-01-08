import type { SqlError } from '@effect/sql/SqlError'
import { ChatRepository } from '@lily/api/repositories/chat.repository'
import { Session } from '@lily/api/services/auth/session'
import type { ChatHistoryListResponse } from '@lily/shared/ai-chat'
import { Effect } from 'effect'

export const getChatHistory = (params: {
  plantId: string
  page?: number
  limit?: number
}): Effect.Effect<
  ChatHistoryListResponse,
  SqlError,
  ChatRepository | Session
> =>
  Effect.gen(function* () {
    const chatRepo = yield* ChatRepository
    const { userId } = yield* Session

    return yield* chatRepo.findByPlantId({
      plantId: params.plantId,
      userId,
      ...(params.page !== undefined && { page: params.page }),
      ...(params.limit !== undefined && { limit: params.limit }),
    })
  })
