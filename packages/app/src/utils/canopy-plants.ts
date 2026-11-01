import type { CanopyMemberRole, PlantOwnership } from '@lily/shared'
import { Array, Match, Option, pipe } from 'effect'
import type { TFunction } from 'i18next'

// Mirrors the role table in packages/api/src/services/plants/helpers/plant-access.ts.
// The API stays the authority; this only decides which actions the app offers.
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

export interface PlantActions {
  readonly shareToCanopy: boolean
  readonly unshare: boolean
  readonly mute: boolean
  readonly delete: boolean
}

export const plantActionsFor = (
  role: PlantRole,
  inCanopy: boolean
): PlantActions => ({
  shareToCanopy: role === 'owner' && inCanopy,
  unshare: role === 'canopyOwner' || role === 'canopyCreator',
  mute:
    role === 'canopyOwner' ||
    role === 'canopyCreator' ||
    role === 'canopyMember',
  delete:
    role === 'owner' || role === 'canopyOwner' || role === 'canopyCreator',
})

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
