import { Data, Option } from 'effect'

export type PlantAction =
  | 'view'
  | 'edit'
  | 'care'
  | 'photo'
  | 'curate'
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

export const actingUserId = (permit: PlantPermit<PlantAction>): string | null =>
  Actor.$match(permit.actor, {
    User: ({ userId }) => userId,
    System: () => null,
  })

export type RecordAction = Extract<PlantAction, 'care' | 'photo'>

/**
 * The permit of a command on one record of a plant. A `curate` permit covers
 * every record of the plant. The permit for the action that adds such a
 * record covers only the records its actor added.
 */
export type RecordPermit<Add extends RecordAction> =
  | PlantPermit<'curate'>
  | PlantPermit<Add>

/** A record with no known author is someone else's. */
export const coversRecordOf = (
  permit: RecordPermit<RecordAction>,
  author: Option.Option<string>
): boolean =>
  permit.action === 'curate' ||
  Option.exists(author, (userId) => userId === actingUserId(permit))

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
