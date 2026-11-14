import {
  type CanopyInvitationRow,
  type CanopyMemberRow,
  type CanopyMembership,
  CanopyRepository,
  type CanopyRow,
  type ICanopyRepository,
} from '@lily/api/repositories/canopy.repository'
import type { LanguageCode } from '@lily/shared'
import { Array, Effect, Layer, Option, pipe, Record } from 'effect'

export interface MockMembership extends CanopyMembership {
  readonly userId: string
  readonly canopyName?: string
  readonly name?: string | null
  readonly language?: LanguageCode
}

export interface MockCanopyInvite {
  canopyId: string
  tokenHash: string
  createdByUserId: string | null
  expiresAt: Date
  revokedAt: Date | null
}

export interface MockCanopyPlant {
  readonly id: string
  readonly remindersEnabled: boolean
  readonly diedAt: Date | null
  canopyId: string | null
  userId: string | null
  createdByUserId?: string | null
  roomId?: string | null
}

export interface MockCanopyStore {
  canopies: CanopyRow[]
  members: MockMembership[]
  invites: MockCanopyInvite[]
  invitations: CanopyInvitationRow[]
  mutes: Array<{ userId: string; plantId: string }>
  plants: MockCanopyPlant[]
  rooms: Array<{ id: string; canopyId: string | null; userId: string | null }>
}

export const createCanopyStore = (
  init: Partial<MockCanopyStore> = {}
): MockCanopyStore => ({
  canopies: [...(init.canopies ?? [])],
  members: [...(init.members ?? [])],
  invites: [...(init.invites ?? [])],
  invitations: [...(init.invitations ?? [])],
  mutes: [...(init.mutes ?? [])],
  plants: [...(init.plants ?? [])],
  rooms: [...(init.rooms ?? [])],
})

export const createTestCanopyRow = (
  overrides: Partial<CanopyRow> = {}
): CanopyRow => ({
  id: 'canopy-1',
  name: 'Home',
  timezone: 'Europe/Paris',
  latitude: null,
  longitude: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
})

const toMemberRow = (m: MockMembership): CanopyMemberRow => ({
  userId: m.userId,
  name: pipe(Option.fromNullishOr(m.name), Option.getOrNull),
  image: null,
  language: m.language ?? 'en',
  role: m.role,
  joinedAt: m.joinedAt,
})

export const createMockCanopyRepository = (
  input: ReadonlyArray<MockMembership> | MockCanopyStore = []
): Layer.Layer<CanopyRepository> => {
  const store: MockCanopyStore =
    'canopies' in input ? input : createCanopyStore({ members: [...input] })

  const findCanopy = (canopyId: string) =>
    pipe(
      Array.findFirst(store.canopies, (c) => c.id === canopyId),
      Option.getOrNull
    )

  const findInvitation = (id: string) =>
    pipe(
      Array.findFirst(store.invitations, (i) => i.id === id),
      Option.getOrNull
    )

  const nameOf = (userId: string) =>
    pipe(
      Array.findFirst(store.members, (m) => m.userId === userId),
      Option.flatMap((m) => Option.fromNullishOr(m.name)),
      Option.getOrNull
    )

  const repo: ICanopyRepository = {
    findMembershipByUser: (userId) =>
      Effect.succeed(
        pipe(
          Array.findFirst(store.members, (m) => m.userId === userId),
          Option.map(({ canopyId, role, joinedAt }) => ({
            canopyId,
            role,
            joinedAt,
          })),
          Option.getOrNull
        )
      ),
    findById: (canopyId) => Effect.sync(() => findCanopy(canopyId)),
    findMembersByJoinDate: (canopyId) =>
      Effect.sync(() =>
        pipe(
          store.members,
          Array.filter((m) => m.canopyId === canopyId),
          Array.sort(
            (a: MockMembership, b: MockMembership) =>
              Math.sign(a.joinedAt.getTime() - b.joinedAt.getTime()) as
                | -1
                | 0
                | 1
          ),
          Array.map(toMemberRow)
        )
      ),
    findMemberIdsByCanopyIds: (canopyIds) =>
      Effect.sync(() =>
        pipe(
          store.members,
          Array.filter((m) => Array.contains(canopyIds, m.canopyId)),
          Array.groupBy((m) => m.canopyId),
          Record.map(Array.map((m) => m.userId))
        )
      ),
    findReminderRecipients: (canopyId, plantId) =>
      Effect.sync(() =>
        pipe(
          store.members,
          Array.filter(
            (m) =>
              m.canopyId === canopyId &&
              !Array.some(
                store.mutes,
                (mute) => mute.userId === m.userId && mute.plantId === plantId
              )
          ),
          Array.sort(
            (a: MockMembership, b: MockMembership) =>
              Math.sign(a.joinedAt.getTime() - b.joinedAt.getTime()) as
                | -1
                | 0
                | 1
          ),
          Array.map((m) => m.userId)
        )
      ),
    findPlantIdsOfCanopy: (canopyId) =>
      Effect.succeed(
        pipe(
          Array.filter(store.plants, (p) => p.canopyId === canopyId),
          Array.map((p) => p.id)
        )
      ),
    findWithLocation: () =>
      Effect.sync(() =>
        Array.filter(
          store.canopies,
          (c) => c.latitude !== null && c.longitude !== null
        )
      ),
    findActiveInvite: (canopyId) =>
      Effect.sync(() =>
        pipe(
          Array.findFirst(
            store.invites,
            (i) =>
              i.canopyId === canopyId &&
              i.revokedAt === null &&
              i.expiresAt.getTime() > Date.now()
          ),
          Option.map((i) => ({ expiresAt: i.expiresAt })),
          Option.getOrNull
        )
      ),
    findInviteByTokenHash: (tokenHash) =>
      Effect.sync(() =>
        pipe(
          Array.findFirst(store.invites, (i) => i.tokenHash === tokenHash),
          Option.flatMap((invite) =>
            pipe(
              Option.fromNullishOr(findCanopy(invite.canopyId)),
              Option.map((canopy) => ({
                canopyId: invite.canopyId,
                canopyName: canopy.name,
                inviterName: pipe(
                  Array.findFirst(
                    store.members,
                    (m) => m.userId === invite.createdByUserId
                  ),
                  Option.flatMap((m) => Option.fromNullishOr(m.name)),
                  Option.getOrNull
                ),
                memberCount: Array.filter(
                  store.members,
                  (m) => m.canopyId === invite.canopyId
                ).length,
                expiresAt: invite.expiresAt,
                revokedAt: invite.revokedAt,
              }))
            )
          ),
          Option.getOrNull
        )
      ),
    findInvitationPreview: (id) =>
      Effect.sync(() =>
        pipe(
          Option.fromNullishOr(findInvitation(id)),
          Option.flatMap((invitation) =>
            pipe(
              Option.fromNullishOr(findCanopy(invitation.canopyId)),
              Option.map((canopy) => ({
                ...invitation,
                canopyName: canopy.name,
                inviterName: nameOf(invitation.invitedByUserId),
                memberCount: Array.filter(
                  store.members,
                  (m) => m.canopyId === invitation.canopyId
                ).length,
              }))
            )
          ),
          Option.getOrNull
        )
      ),
    findPendingInvitations: (canopyId) =>
      Effect.sync(() =>
        pipe(
          store.invitations,
          Array.filter(
            (i) =>
              i.canopyId === canopyId &&
              i.status === 'pending' &&
              i.expiresAt.getTime() > Date.now()
          ),
          Array.map((i) => ({
            id: i.id,
            invitee: { userId: i.inviteeUserId, name: null, image: null },
            invitedByUserId: i.invitedByUserId,
            expiresAt: i.expiresAt,
          }))
        )
      ),
    isMuted: (userId, plantId) =>
      Effect.sync(() =>
        Array.some(
          store.mutes,
          (m) => m.userId === userId && m.plantId === plantId
        )
      ),
  }

  return Layer.succeed(CanopyRepository, repo)
}
