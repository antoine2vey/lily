import type { CarePlanRepository } from '@lily/api/repositories/care-plan.repository'
import type { PlantRepository } from '@lily/api/repositories/plant.repository'
import { suggestionsFor } from '@lily/api/services/ai-chat/chat-suggestions'
import { loadPlantSituation } from '@lily/api/services/ai-chat/plant-situation'
import {
  type PlantAccessContext,
  withPlantKnowledge,
} from '@lily/api/services/plants/helpers/with-plant-access'
import type { LanguageCode } from '@lily/shared'
import type { ChatSuggestions } from '@lily/shared/ai-chat'
import type {
  PlantNotAuthorizedError,
  PlantNotFoundError,
} from '@lily/shared/errors/plant'
import { Effect } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export const listChatSuggestions = (
  plantId: string,
  language: LanguageCode
): Effect.Effect<
  ChatSuggestions,
  SqlError | PlantNotFoundError | PlantNotAuthorizedError,
  PlantRepository | PlantAccessContext | CarePlanRepository
> =>
  Effect.gen(function* () {
    const { plant, view } = yield* withPlantKnowledge(plantId, 'chat')
    const situation = yield* loadPlantSituation(plant, view)
    return { suggestions: suggestionsFor(situation, language) }
  }).pipe(Effect.withSpan('AIChatService.listChatSuggestions'))
