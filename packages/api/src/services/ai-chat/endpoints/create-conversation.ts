import { ChatRepository } from '@lily/api/repositories/chat.repository'
import { PlantRepository } from '@lily/api/repositories/plant.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import {
  assertPlantAction,
  type PlantAccessContext,
} from '@lily/api/services/plants/helpers/with-plant-access'
import type { ChatConversation } from '@lily/shared/ai-chat'
import {
  type PlantNotAuthorizedError,
  PlantNotFoundError,
} from '@lily/shared/errors/plant'
import { Effect } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export interface CreateConversationParams {
  kind: 'general' | 'plant'
  plantId?: string | undefined
  title?: string | undefined
}

export const createConversation = (
  params: CreateConversationParams
): Effect.Effect<
  ChatConversation,
  SqlError | PlantNotFoundError | PlantNotAuthorizedError,
  ChatRepository | PlantRepository | PlantAccessContext
> =>
  Effect.gen(function* () {
    const chatRepo = yield* ChatRepository
    const { id: userId } = yield* CurrentUser

    if (params.kind === 'plant') {
      const plantId = params.plantId
      if (!plantId) {
        return yield* new PlantNotFoundError({ plantId: 'undefined' })
      }
      const plantRepo = yield* PlantRepository
      const plant = yield* plantRepo.findById(plantId)
      if (!plant) {
        return yield* new PlantNotFoundError({ plantId })
      }
      yield* assertPlantAction(plant, 'chat')
      return yield* chatRepo.findOrCreatePlantConversation({ userId, plantId })
    }

    return yield* chatRepo.createGeneralConversation({
      userId,
      ...(params.title !== undefined ? { title: params.title } : {}),
    })
  }).pipe(Effect.withSpan('AIChatService.createConversation'))
