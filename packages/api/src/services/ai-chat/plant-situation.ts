import { CarePlanRepository } from '@lily/api/repositories/care-plan.repository'
import type { PlantWithRoom } from '@lily/api/repositories/plant.repository'
import type { PlantSituation } from '@lily/api/services/ai-chat/chat-suggestions'
import { seesCarePlan } from '@lily/api/services/care-plans/helpers/care-plan-access'
import type { KnowledgeView } from '@lily/api/services/plants/helpers/plant-access'
import { CareDays } from '@lily/shared'
import type { CarePlan } from '@lily/shared/care-plan'
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

export const loadPlantSituation = (
  plant: PlantWithRoom,
  view: KnowledgeView
): Effect.Effect<PlantSituation, SqlError, CarePlanRepository> =>
  Effect.map(
    Effect.flatMap(CarePlanRepository, (repo) => repo.findByPlant(plant.id)),
    (plans) => situationOf(plant, view, plans)
  )
