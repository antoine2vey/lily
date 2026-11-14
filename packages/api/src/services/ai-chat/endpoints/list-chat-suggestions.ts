import { CarePlanRepository } from '@lily/api/repositories/care-plan.repository'
import type {
  PlantRepository,
  PlantWithRoom,
} from '@lily/api/repositories/plant.repository'
import {
  type PlantSituation,
  suggestionsFor,
} from '@lily/api/services/ai-chat/chat-suggestions'
import { seesCarePlan } from '@lily/api/services/care-plans/helpers/care-plan-access'
import type { KnowledgeView } from '@lily/api/services/plants/helpers/plant-access'
import {
  type PlantAccessContext,
  withPlantKnowledge,
} from '@lily/api/services/plants/helpers/with-plant-access'
import { CareDays, type LanguageCode } from '@lily/shared'
import type { ChatSuggestions } from '@lily/shared/ai-chat'
import type { CarePlan } from '@lily/shared/care-plan'
import type {
  PlantNotAuthorizedError,
  PlantNotFoundError,
} from '@lily/shared/errors/plant'
import { Array, DateTime, Effect, Option } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

const hasOpenStep = (plan: CarePlan): boolean =>
  plan.status === 'accepted' &&
  Array.some(plan.steps, (step) =>
    Option.isNone(Option.fromNullishOr(step.completedAt))
  )

const schedulesOfLiving = (plant: PlantWithRoom) =>
  plant.diedAt === null ? plant.schedules : []

const situationOf = (
  plant: PlantWithRoom,
  view: KnowledgeView,
  plans: ReadonlyArray<CarePlan>
): PlantSituation => ({
  name: plant.name,
  health: plant.health,
  addedOn: CareDays.of(
    DateTime.fromDateUnsafe(plant.dateAdded),
    plant.careTimezone
  ),
  today: plant.today,
  petToxicityRating: plant.petToxicityRating,
  schedules: schedulesOfLiving(plant),
  hasOpenPlanStep: Array.some(
    Array.filter(plans, seesCarePlan(view)),
    hasOpenStep
  ),
})

export const listChatSuggestions = (
  plantId: string,
  language: LanguageCode
): Effect.Effect<
  ChatSuggestions,
  SqlError | PlantNotFoundError | PlantNotAuthorizedError,
  PlantRepository | PlantAccessContext | CarePlanRepository
> =>
  Effect.gen(function* () {
    const carePlanRepo = yield* CarePlanRepository
    const { plant, view } = yield* withPlantKnowledge(plantId, 'chat')
    const plans = yield* carePlanRepo.findByPlant(plantId)
    return {
      suggestions: suggestionsFor(situationOf(plant, view, plans), language),
    }
  }).pipe(Effect.withSpan('AIChatService.listChatSuggestions'))
