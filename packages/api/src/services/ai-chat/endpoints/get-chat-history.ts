import type { SqlError } from '@effect/sql/SqlError'
import { ChatRepository } from '@lily/api/repositories/chat.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware'
import type { ChatHistoryListResponse } from '@lily/shared/ai-chat'
import { Effect } from 'effect'

export const getChatHistory = (params: {
  plantId: string
  page?: number
  limit?: number
}): Effect.Effect<
  ChatHistoryListResponse,
  SqlError,
  ChatRepository | CurrentUser
> =>
  Effect.gen(function* () {
    const chatRepo = yield* ChatRepository
    const { id: userId } = yield* CurrentUser

    return yield* chatRepo.findByPlantId({
      plantId: params.plantId,
      userId,
      ...(params.page !== undefined && { page: params.page }),
      ...(params.limit !== undefined && { limit: params.limit }),
    })
  })
