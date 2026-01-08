import type { SqlError } from '@effect/sql/SqlError'
import { ChatRepository } from '@lily/api/repositories/chat.repository'
import { Session } from '@lily/api/services/auth/session'
import type { ChatMessage } from '@lily/shared/ai-chat'
import { Effect } from 'effect'

export const getChatHistory = (
  plantId: string
): Effect.Effect<ChatMessage[], SqlError, ChatRepository | Session> =>
  Effect.gen(function* () {
    const chatRepo = yield* ChatRepository
    const { userId } = yield* Session

    const messages = yield* chatRepo.findByPlantId(plantId, userId)

    return messages
  })
