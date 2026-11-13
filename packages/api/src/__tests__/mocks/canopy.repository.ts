import {
  type CanopyInvitationRow,
  type CanopyMemberRow,
  type CanopyMembership,
  CanopyRepository,
  type CanopyRow,
  type ICanopyRepository,
  type MovedPlant,
} from '@lily/api/repositories/canopy.repository'
import type { CanopyId, LanguageCode } from '@lily/shared'
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

export interface MockCanopyPlant extends MovedPlant {
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

const remove = <A>(rows: A[], drop: (row: A) => boolean) => {
  const kept = Array.filter(rows, (row) => !drop(row))
  const removed = rows.length - kept.length
  rows.length = 0
  rows.push(...kept)
  return removed
}

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
    lock: (canopyId) => Effect.sync(() => findCanopy(canopyId)),
    create: (data) =>
      Effect.sync(() => {
        const row = createTestCanopyRow({
          ...data,
          id: `canopy-${crypto.randomUUID()}`,
        })
        store.canopies.push(row)
        return row
      }),
    update: (canopyId, data) =>
      Effect.sync(() => {
        const existing = findCanopy(canopyId)
        if (existing === null) return null
        Object.assign(existing, data, { updatedAt: new Date() })
        return existing
      }),
    delete: (canopyId) =>
      Effect.sync(() => {
        remove(store.canopies, (c) => c.id === canopyId)
        remove(store.members, (m) => m.canopyId === canopyId)
        remove(store.invites, (i) => i.canopyId === canopyId)
        remove(store.invitations, (i) => i.canopyId === canopyId)
      }),
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
    addMember: (canopyId, userId, role) =>
      Effect.sync(() => {
        if (Array.some(store.members, (m) => m.userId === userId)) {
          return false
        }
        store.members.push({
          canopyId: canopyId as CanopyId,
          userId,
          role,
          joinedAt: new Date(),
        })
        return true
      }),
    removeMember: (canopyId, userId) =>
      Effect.sync(
        () =>
          remove(
            store.members,
            (m) => m.canopyId === canopyId && m.userId === userId
          ) > 0
      ),
    setRole: (canopyId, userId, role) =>
      Effect.sync(() => {
        const index = store.members.findIndex(
          (m) => m.canopyId === canopyId && m.userId === userId
        )
        const member = store.members[index]
        if (member) store.members[index] = { ...member, role }
      }),
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
    replaceInvite: (invite) =>
      Effect.sync(() => {
        Array.forEach(store.invites, (i) => {
          if (i.canopyId === invite.canopyId && i.revokedAt === null) {
            i.revokedAt = new Date()
          }
        })
        store.invites.push({ ...invite, revokedAt: null })
      }),
    revokeInvite: (canopyId) =>
      Effect.sync(() => {
        Array.forEach(store.invites, (i) => {
          if (i.canopyId === canopyId && i.revokedAt === null) {
            i.revokedAt = new Date()
          }
        })
      }),
    revokeInviteCreatedBy: (canopyId, userId) =>
      Effect.sync(() => {
        Array.forEach(store.invites, (i) => {
          if (
            i.canopyId === canopyId &&
            i.createdByUserId === userId &&
            i.revokedAt === null
          ) {
            i.revokedAt = new Date()
          }
        })
      }),
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
    findInvitation: (id) => Effect.sync(() => findInvitation(id)),
    lockInvitation: (id) => Effect.sync(() => findInvitation(id)),
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
    findInvitationByPair: (canopyId, inviteeUserId) =>
      Effect.sync(() =>
        pipe(
          Array.findFirst(
            store.invitations,
            (i) => i.canopyId === canopyId && i.inviteeUserId === inviteeUserId
          ),
          Option.getOrNull
        )
      ),
    upsertInvitation: (invitation) =>
      Effect.sync(() => {
        const fresh = {
          invitedByUserId: invitation.invitedByUserId,
          status: 'pending' as const,
          expiresAt: invitation.expiresAt,
          resolvedAt: null,
          createdAt: new Date(),
        }
        const existing = Array.findFirst(
          store.invitations,
          (i) =>
            i.canopyId === invitation.canopyId &&
            i.inviteeUserId === invitation.inviteeUserId
        )
        if (Option.isSome(existing)) {
          return Object.assign(existing.value, fresh)
        }
        const row = { ...invitation, ...fresh, id: crypto.randomUUID() }
        store.invitations.push(row)
        return row
      }),
    transitionInvitation: (id, from, to) =>
      Effect.sync(() => {
        const invitation = findInvitation(id)
        if (invitation === null || invitation.status !== from) return null
        return Object.assign(invitation, { status: to, resolvedAt: new Date() })
      }),
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
    withdrawInvitationsSentBy: (canopyId, userId) =>
      Effect.sync(() => {
        Array.forEach(store.invitations, (i) => {
          if (
            i.canopyId === canopyId &&
            i.invitedByUserId === userId &&
            i.status === 'pending'
          ) {
            Object.assign(i, { status: 'withdrawn', resolvedAt: new Date() })
          }
        })
      }),
    mute: (userId, plantId) =>
      Effect.sync(() => {
        if (
          !Array.some(
            store.mutes,
            (m) => m.userId === userId && m.plantId === plantId
          )
        ) {
          store.mutes.push({ userId, plantId })
        }
      }),
    unmute: (userId, plantId) =>
      Effect.sync(() => {
        remove(store.mutes, (m) => m.userId === userId && m.plantId === plantId)
      }),
    isMuted: (userId, plantId) =>
      Effect.sync(() =>
        Array.some(
          store.mutes,
          (m) => m.userId === userId && m.plantId === plantId
        )
      ),
    deleteMutesForPlant: (plantId) =>
      Effect.sync(() => {
        remove(store.mutes, (m) => m.plantId === plantId)
      }),
    deleteMemberMutes: (canopyId, userId) =>
      Effect.sync(() => {
        const canopyPlantIds = pipe(
          Array.filter(store.plants, (p) => p.canopyId === canopyId),
          Array.map((p) => p.id)
        )
        remove(
          store.mutes,
          (m) =>
            m.userId === userId && Array.contains(canopyPlantIds, m.plantId)
        )
      }),
    transferToUser: (canopyId, userId) =>
      Effect.sync(() => {
        const moved = Array.filter(store.plants, (p) => p.canopyId === canopyId)
        const movedIds = Array.map(moved, (p) => p.id)
        remove(store.mutes, (m) => Array.contains(movedIds, m.plantId))
        Array.forEach(moved, (p) => {
          p.canopyId = null
          p.userId = userId
        })
        Array.forEach(store.rooms, (r) => {
          if (r.canopyId === canopyId) {
            r.canopyId = null
            r.userId = userId
          }
        })
        return Array.map(moved, ({ id, remindersEnabled, diedAt }) => ({
          id,
          remindersEnabled,
          diedAt,
        }))
      }),
    returnToSharer: (canopyId, sharerId) =>
      Effect.sync(() => {
        const returned = Array.filter(
          store.plants,
          (p) => p.canopyId === canopyId && p.createdByUserId === sharerId
        )
        const returnedIds = Array.map(returned, (p) => p.id)
        remove(store.mutes, (m) => Array.contains(returnedIds, m.plantId))
        Array.forEach(returned, (p) => {
          p.canopyId = null
          p.userId = sharerId
          p.roomId = null
        })
        return Array.map(returned, ({ id, remindersEnabled, diedAt }) => ({
          id,
          remindersEnabled,
          diedAt,
        }))
      }),
  }

  return Layer.succeed(CanopyRepository, repo)
}
