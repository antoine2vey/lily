import { EventBus, publishWithRetry } from '@lily/api/events'
import { CurrentUser } from '@lily/api/services/auth/middleware.types'
import { Effect } from 'effect'

export const sharePlant = Effect.fn('PlantsService.sharePlant')(function* (
  plantId: string
) {
  const { id: userId } = yield* CurrentUser
  const eventBus = yield* EventBus

  yield* publishWithRetry(
    eventBus.publish({
      _tag: 'PlantShared',
      userId,
      plantId,
    })
  )
})
