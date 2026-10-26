import type { CanopyMembership } from '@lily/api/repositories/canopy.repository'
import type { PlantOwner } from '@lily/shared'
import { Array, Data, Match, Option, pipe } from 'effect'

export type PlantRole = Data.TaggedEnum<{
  Owner: {}
  Caretaker: {}
  CanopyOwner: {}
  CanopyCreator: {}
  CanopyMember: {}
}>

export const PlantRole = Data.taggedEnum<PlantRole>()

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

type RoleTag = PlantRole['_tag']

const everyone: ReadonlyArray<RoleTag> = [
  'Owner',
  'Caretaker',
  'CanopyOwner',
  'CanopyCreator',
  'CanopyMember',
]
const members: ReadonlyArray<RoleTag> = [
  'Owner',
  'CanopyOwner',
  'CanopyCreator',
  'CanopyMember',
]
const deleters: ReadonlyArray<RoleTag> = [
  'Owner',
  'CanopyOwner',
  'CanopyCreator',
]

export const allowedRoles: Record<PlantAction, ReadonlyArray<RoleTag>> = {
  view: everyone,
  edit: everyone,
  care: everyone,
  photo: everyone,
  diagnose: everyone,
  chat: everyone,
  markDead: members,
  revive: members,
  delete: deleters,
  share: ['Owner'],
  unshare: ['CanopyOwner', 'CanopyCreator'],
  mute: ['CanopyOwner', 'CanopyCreator', 'CanopyMember'],
  delegate: ['Owner'],
}

export const allows = (action: PlantAction) => (role: PlantRole) =>
  Array.contains(allowedRoles[action], role._tag)

export interface PlantAccessFacts {
  readonly userId: string
  readonly membership: CanopyMembership | null
  readonly caretaker: boolean
}

export const plantRole = (
  plant: {
    readonly owner: PlantOwner
    readonly createdByUserId: string | null
  },
  facts: PlantAccessFacts
): Option.Option<PlantRole> =>
  pipe(
    Match.value(plant.owner),
    Match.tag('User', ({ userId }) =>
      userId === facts.userId
        ? Option.some(PlantRole.Owner())
        : facts.caretaker
          ? Option.some(PlantRole.Caretaker())
          : Option.none()
    ),
    Match.tag('Canopy', ({ canopyId }) =>
      pipe(
        Option.fromNullishOr(facts.membership),
        Option.filter((membership) => membership.canopyId === canopyId),
        Option.map((membership) =>
          membership.role === 'owner'
            ? PlantRole.CanopyOwner()
            : plant.createdByUserId === facts.userId
              ? PlantRole.CanopyCreator()
              : PlantRole.CanopyMember()
        )
      )
    ),
    Match.exhaustive
  )
