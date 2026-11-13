import { Data } from 'effect'

export type PlantAction =
  | 'view'
  | 'edit'
  | 'care'
  | 'photo'
  | 'diagnose'
  | 'chat'
  | 'markDead'
  | 'revive'
  | 'delete'
  | 'share'
  | 'unshare'
  | 'mute'
  | 'delegate'

export type Actor = Data.TaggedEnum<{
  User: { readonly userId: string }
  System: { readonly job: string }
}>
export const Actor = Data.taggedEnum<Actor>()

declare const PermitBrand: unique symbol

/** Proof that `actor` may perform `action` on a plant. */
export interface PlantPermit<A extends PlantAction> {
  readonly plantId: string
  readonly action: A
  readonly actor: Actor
  readonly [PermitBrand]: A
}

/** Only access modules may call this, after the role check has passed. */
export const mintPermit = <A extends PlantAction>(
  plantId: string,
  action: A,
  actor: Actor
): PlantPermit<A> => ({ plantId, action, actor }) as PlantPermit<A>

/** For a job that has already scoped the plants it acts on. */
export const systemPermit = <A extends PlantAction>(
  plantId: string,
  action: A,
  job: string
): PlantPermit<A> => mintPermit(plantId, action, Actor.System({ job }))

export const actingUserId = (permit: PlantPermit<PlantAction>): string | null =>
  Actor.$match(permit.actor, {
    User: ({ userId }) => userId,
    System: () => null,
  })

export type PlanAction = 'manage' | 'tick'

declare const PlanPermitBrand: unique symbol

/**
 * Proof that `by` may perform `action` on the care plan `planId`, which the
 * access check found on the plant `plantId`.
 */
export interface PlanPermit<A extends PlanAction> {
  readonly planId: string
  readonly plantId: string
  readonly action: A
  readonly by: string
  readonly [PlanPermitBrand]: A
}

/** Only access modules may call this, after the role check has passed. */
export const mintPlanPermit = <A extends PlanAction>(
  plan: { readonly id: string; readonly plantId: string },
  action: A,
  by: string
): PlanPermit<A> =>
  ({ planId: plan.id, plantId: plan.plantId, action, by }) as PlanPermit<A>
