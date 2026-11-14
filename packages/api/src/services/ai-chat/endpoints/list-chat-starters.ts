import { ChatRepository } from '@lily/api/repositories/chat.repository'
import {
  PlantRepository,
  type PlantWithRoom,
} from '@lily/api/repositories/plant.repository'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import type { PlantHealthStatus } from '@lily/shared'
import type { ChatStarterPlant, ChatStarters } from '@lily/shared/ai-chat'
import { Array, Effect, Option, Order, pipe } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export const CHAT_STARTER_PLANT_LIMIT = 20

const NEEDS_HELP: Record<PlantHealthStatus, boolean> = {
  THRIVING: false,
  HEALTHY: false,
  NEEDS_ATTENTION: true,
  SICK: true,
  RECOVERING: true,
}

const starterOrder = Order.combine(
  Order.mapInput(
    Order.flip(Order.Boolean),
    (plant: PlantWithRoom) => NEEDS_HELP[plant.health]
  ),
  Order.combine(
    Order.mapInput(Order.flip(Order.Number), (plant: PlantWithRoom) =>
      plant.dateAdded.getTime()
    ),
    Order.mapInput(Order.String, (plant: PlantWithRoom) => plant.id)
  )
)

const toStarterPlant = (plant: PlantWithRoom): ChatStarterPlant => ({
  plantId: plant.id,
  name: plant.name,
  ...pipe(
    Option.fromNullishOr(plant.imageUrl),
    Option.match({
      onNone: () => ({}),
      onSome: (imageUrl) => ({ imageUrl }),
    })
  ),
})

/**
 * The living plants the user can open a plant chat with and has never written
 * to, scoped like the full plant list (owned, caretaking and Canopy plants).
 */
export const listChatStarters: Effect.Effect<
  ChatStarters,
  SqlError,
  ChatRepository | PlantRepository | CurrentUser
> = Effect.gen(function* () {
  const chatRepo = yield* ChatRepository
  const plantRepo = yield* PlantRepository
  const { id: userId } = yield* CurrentUser

  const [{ items }, chattedPlantIds] = yield* Effect.all(
    [
      plantRepo.findAll({
        userId,
        filter: 'all',
        includeCaretaking: true,
        includeCanopy: true,
        limit: Number.MAX_SAFE_INTEGER,
      }),
      chatRepo.findChattedPlantIds(userId),
    ],
    { concurrency: 'unbounded' }
  )

  return {
    plants: pipe(
      items,
      Array.filter((plant) => !Array.contains(chattedPlantIds, plant.id)),
      Array.sort(starterOrder),
      Array.take(CHAT_STARTER_PLANT_LIMIT),
      Array.map(toStarterPlant)
    ),
  }
}).pipe(Effect.withSpan('AIChatService.listChatStarters'))
