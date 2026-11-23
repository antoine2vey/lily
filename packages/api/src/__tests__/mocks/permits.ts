import {
  Actor,
  type PlanAction,
  type PlanPermit,
  type PlantAction,
  type PlantPermit,
} from '@lily/api/kernel/permit'

export const mintPermit = <A extends PlantAction>(
  plantId: string,
  action: A,
  actor: Actor
): PlantPermit<A> => ({ plantId, action, actor }) as PlantPermit<A>

export const systemPermit = <A extends PlantAction>(
  plantId: string,
  action: A,
  job: string
): PlantPermit<A> => mintPermit(plantId, action, Actor.System({ job }))

export const mintPlanPermit = <A extends PlanAction>(
  plan: { readonly id: string; readonly plantId: string },
  action: A,
  by: string
): PlanPermit<A> =>
  ({ planId: plan.id, plantId: plan.plantId, action, by }) as PlanPermit<A>
