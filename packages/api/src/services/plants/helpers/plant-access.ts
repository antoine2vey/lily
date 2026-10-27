import type { CanopyMembership } from '@lily/api/repositories/canopy.repository'
import { Array, Data, Option, pipe } from 'effect'

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

export const personalRole = (
  ownerId: string,
  userId: string,
  caretaker: boolean
): Option.Option<PlantRole> =>
  ownerId === userId
    ? Option.some(PlantRole.Owner())
    : caretaker
      ? Option.some(PlantRole.Caretaker())
      : Option.none()

export const canopyRole = (
  plant: { readonly canopyId: string; readonly createdByUserId: string | null },
  userId: string,
  membership: CanopyMembership | null
): Option.Option<PlantRole> =>
  pipe(
    Option.fromNullishOr(membership),
    Option.filter((m) => m.canopyId === plant.canopyId),
    Option.map((m) =>
      m.role === 'owner'
        ? PlantRole.CanopyOwner()
        : plant.createdByUserId === userId
          ? PlantRole.CanopyCreator()
          : PlantRole.CanopyMember()
    )
  )
