import type { CanopyMembership } from '@lily/api/repositories/canopy.repository'
import { Array, Data, Match, Option, pipe, Struct } from 'effect'

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

export type KnowledgeView = Data.TaggedEnum<{
  Household: { readonly viewerId: string }
  Personal: { readonly viewerId: string }
}>

export const KnowledgeView = Data.taggedEnum<KnowledgeView>()

const householdKnowledge: ReadonlyArray<RoleTag> = [
  'CanopyOwner',
  'CanopyCreator',
  'CanopyMember',
]

export const knowledgeView = (
  role: PlantRole,
  viewerId: string
): KnowledgeView =>
  Array.contains(householdKnowledge, role._tag)
    ? KnowledgeView.Household({ viewerId })
    : KnowledgeView.Personal({ viewerId })

export const asSeenBy =
  (viewerId: string) =>
  <
    A extends {
      readonly userId: string
      readonly chatMessageId?: string | undefined
    },
  >(
    row: A
  ): A | Omit<A, 'chatMessageId'> =>
    row.userId === viewerId ? row : Struct.omit(row, ['chatMessageId'])

export const authorScope: (view: KnowledgeView) => Option.Option<string> =
  KnowledgeView.$match({
    Household: () => Option.none(),
    Personal: ({ viewerId }) => Option.some(viewerId),
  })

export const personalRole = (
  ownerId: string,
  userId: string,
  caretaker: boolean
): Option.Option<PlantRole> =>
  pipe(
    Match.value({ owner: ownerId === userId, caretaker }),
    Match.when({ owner: true }, () => Option.some(PlantRole.Owner())),
    Match.when({ caretaker: true }, () => Option.some(PlantRole.Caretaker())),
    Match.orElse(() => Option.none())
  )

export const canopyRole = (
  plant: { readonly canopyId: string; readonly createdByUserId: string | null },
  userId: string,
  membership: CanopyMembership | null
): Option.Option<PlantRole> =>
  pipe(
    Option.fromNullishOr(membership),
    Option.filter((m) => m.canopyId === plant.canopyId),
    Option.map((m) =>
      pipe(
        Match.value({
          role: m.role,
          creator: plant.createdByUserId === userId,
        }),
        Match.when({ role: 'owner' }, () => PlantRole.CanopyOwner()),
        Match.when({ creator: true }, () => PlantRole.CanopyCreator()),
        Match.orElse(() => PlantRole.CanopyMember())
      )
    )
  )
