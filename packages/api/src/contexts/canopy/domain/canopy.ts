import type { InvitationState } from '@lily/api/contexts/canopy/domain/invitation'
import type {
  CanopyId,
  CanopyMemberRole,
  LanguageCode,
  PlantOwner,
} from '@lily/shared'
import { Array, DateTime, Option, Order, pipe } from 'effect'

export interface Location {
  readonly latitude: number
  readonly longitude: number
}

export interface Account {
  readonly userId: string
  readonly name: string | null
  readonly language: LanguageCode
  readonly timezone: string | null
  readonly location: Option.Option<Location>
  readonly reachable: boolean
}

export interface Member {
  readonly userId: string
  readonly role: CanopyMemberRole
  readonly joinedAt: DateTime.Utc
}

export interface Link {
  readonly tokenHash: string
  readonly expiresAt: DateTime.Utc
}

export interface Invitation extends InvitationState {
  readonly id: string
  readonly invitee: string
  readonly invitedBy: string
}

export interface HeldRoom {
  readonly id: string
  readonly owner: PlantOwner
}

export interface HeldPlant {
  readonly id: string
  readonly owner: PlantOwner
  readonly sharer: Option.Option<string>
  readonly living: boolean
}

export const takesASlot = (plant: HeldPlant): boolean => plant.living

export interface CanopyState {
  readonly id: CanopyId
  readonly name: string
  readonly timezone: string
  readonly members: ReadonlyArray<Member>
  readonly link: Option.Option<Link>
}

export interface Held {
  readonly canopy: Option.Option<CanopyState>
  readonly actorCanopy: Option.Option<{
    readonly canopyId: CanopyId
    readonly name: string
  }>
  readonly accounts: ReadonlyMap<string, Account>
  readonly invitations: ReadonlyArray<Invitation>
  readonly rooms: ReadonlyArray<HeldRoom>
  readonly plants: ReadonlyArray<HeldPlant>
}

export const HELD_NOTHING: Held = {
  canopy: Option.none(),
  actorCanopy: Option.none(),
  accounts: new Map(),
  invitations: [],
  rooms: [],
  plants: [],
}

export const memberOf = (
  canopy: CanopyState,
  userId: string
): Option.Option<Member> =>
  Array.findFirst(canopy.members, (member) => member.userId === userId)

const earliestJoinerFirst = Order.mapInput(
  DateTime.Order,
  (member: Member) => member.joinedAt
)

export const successorOf = (
  canopy: CanopyState,
  leaver: string
): Option.Option<Member> => {
  const staying = Array.filter(
    canopy.members,
    (member) => member.userId !== leaver
  )
  return pipe(
    Array.findFirst(staying, (member) => member.role === 'owner'),
    Option.orElse(() => Array.head(Array.sort(staying, earliestJoinerFirst)))
  )
}
