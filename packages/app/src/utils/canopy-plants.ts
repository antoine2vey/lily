import type { CanopyMemberRole, PlantOwnership } from '@lily/shared'
import { Array, Match, Option, pipe } from 'effect'
import type { TFunction } from 'i18next'

// Mirrors the role table in packages/api/src/services/plants/helpers/plant-access.ts.
// The API stays the authority; this only decides which actions the app offers.
// One rule lives outside the table: the table lets the Canopy owner unshare,
// then packages/api/src/services/plants/endpoints/unshare-plant.ts refuses a
// plant whose sharer is still a member. PlantSharer carries that condition.
// An owner who shared the plant is a canopyOwner whose sharer is 'you'.
export type PlantRole =
  | 'owner'
  | 'caretaker'
  | 'canopyOwner'
  | 'canopyCreator'
  | 'canopyMember'

interface RoleInput {
  readonly ownership: PlantOwnership
  readonly userId: string | null
  readonly createdBy?: { readonly id: string } | null | undefined
}

export const plantRoleFor = (
  plant: RoleInput,
  me: string,
  canopyRole: CanopyMemberRole | null
): PlantRole =>
  pipe(
    Match.value(plant.ownership),
    Match.when('caretaking', () => 'caretaker' as const),
    // The API reports a delegated plant as owned to its caretaker too.
    Match.when('owned', () =>
      plant.userId === me ? ('owner' as const) : ('caretaker' as const)
    ),
    Match.when('canopy', () =>
      pipe(
        Match.value(canopyRole),
        Match.when('owner', () => 'canopyOwner' as const),
        Match.orElse(() =>
          plant.createdBy?.id === me
            ? ('canopyCreator' as const)
            : ('canopyMember' as const)
        )
      )
    ),
    Match.exhaustive
  )

// Who shared a Canopy plant, seen from the caller. 'gone' is a sharer who
// left or was removed, or whose account no longer exists.
export type PlantSharer = 'you' | 'member' | 'gone'

const plantSharerFor = (
  plant: Pick<RoleInput, 'createdBy'>,
  me: string,
  members: ReadonlyArray<{ readonly userId: string }>
): PlantSharer =>
  pipe(
    Option.fromNullishOr(plant.createdBy),
    Option.match({
      onNone: () => 'gone' as const,
      onSome: ({ id }) =>
        pipe(
          Match.value(id),
          Match.when(
            (sharer) => sharer === me,
            () => 'you' as const
          ),
          Match.when(
            (sharer) => Array.some(members, (m) => m.userId === sharer),
            () => 'member' as const
          ),
          Match.orElse(() => 'gone' as const)
        ),
    })
  )

export interface PlantActions {
  readonly shareToCanopy: boolean
  readonly unshare: boolean
  readonly mute: boolean
  readonly delete: boolean
  // Say goodbye and Bring back.
  readonly endLife: boolean
}

export interface PlantContext {
  readonly inCanopy: boolean
  readonly sharer: PlantSharer
}

export const plantActionsFor = (
  role: PlantRole,
  { inCanopy, sharer }: PlantContext
): PlantActions => ({
  shareToCanopy: role === 'owner' && inCanopy,
  unshare:
    role === 'canopyCreator' || (role === 'canopyOwner' && sharer !== 'member'),
  mute:
    role === 'canopyOwner' ||
    role === 'canopyCreator' ||
    role === 'canopyMember',
  delete:
    role === 'owner' || role === 'canopyOwner' || role === 'canopyCreator',
  endLife: role !== 'caretaker',
})

interface CallerCanopy {
  readonly role: CanopyMemberRole
  readonly members: ReadonlyArray<{ readonly userId: string }>
}

// The actions a screen offers on a plant, given the caller's Canopy.
export const actionsOnPlant = (
  plant: RoleInput,
  me: string,
  canopy: Option.Option<CallerCanopy>
): PlantActions =>
  plantActionsFor(
    plantRoleFor(
      plant,
      me,
      Option.getOrNull(Option.map(canopy, (c) => c.role))
    ),
    {
      inCanopy: Option.isSome(canopy),
      sharer: plantSharerFor(
        plant,
        me,
        Option.match(canopy, { onNone: () => [], onSome: (c) => c.members })
      ),
    }
  )

export type PlantScope = 'all' | 'mine' | 'canopy'

export const PLANT_SCOPES: ReadonlyArray<PlantScope> = ['all', 'mine', 'canopy']

// "Mine" is everything outside the Canopy: the list a user had before joining.
export const filterByScope = <P extends { readonly ownership: PlantOwnership }>(
  plants: ReadonlyArray<P>,
  scope: PlantScope
): ReadonlyArray<P> =>
  pipe(
    Match.value(scope),
    Match.when('all', () => plants),
    Match.when('mine', () =>
      Array.filter(plants, (p) => p.ownership !== 'canopy')
    ),
    Match.when('canopy', () =>
      Array.filter(plants, (p) => p.ownership === 'canopy')
    ),
    Match.exhaustive
  )

export type CareActor =
  | { readonly _tag: 'you' }
  | { readonly _tag: 'member'; readonly name: string }
  | { readonly _tag: 'unnamed' }
  | { readonly _tag: 'former' }

// Who did a care entry, shown on Canopy plants only. A null performer is an
// account that no longer exists.
export const careActorFor = (
  performedBy: { readonly id: string; readonly name: string | null } | null,
  me: string
): CareActor =>
  pipe(
    Option.fromNullishOr(performedBy),
    Option.match({
      onNone: (): CareActor => ({ _tag: 'former' }),
      onSome: (p): CareActor =>
        p.id === me
          ? { _tag: 'you' }
          : pipe(
              Option.fromNullishOr(p.name),
              Option.match({
                onNone: (): CareActor => ({ _tag: 'unnamed' }),
                onSome: (name): CareActor => ({ _tag: 'member', name }),
              })
            ),
    })
  )

// "Watered by Lily". Entries without an actor (personal plants) keep the bare
// action label.
export const withCareActor = (
  action: string,
  actor: CareActor | undefined,
  t: TFunction
): string =>
  pipe(
    Option.fromNullishOr(actor),
    Option.match({
      onNone: () => action,
      onSome: (a) =>
        pipe(
          Match.value(a),
          Match.tagsExhaustive({
            you: () => t('canopy:history.you', { action }),
            member: ({ name }) => t('canopy:history.member', { action, name }),
            unnamed: () => t('canopy:history.unnamed', { action }),
            former: () => t('canopy:history.former', { action }),
          })
        ),
    })
  )
