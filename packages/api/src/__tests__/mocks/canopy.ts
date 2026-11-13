import {
  createCanopyStore,
  createTestCanopyRow,
  type MockCanopyStore,
} from '@lily/api/__tests__/mocks/canopy.repository'
import { createMockDelegationRepository } from '@lily/api/__tests__/mocks/delegation.repository'
import { createMockLimitChecker } from '@lily/api/__tests__/mocks/limit-checker'
import { createMockMessageQueue } from '@lily/api/__tests__/mocks/message-queue'
import { createMockNotificationRepository } from '@lily/api/__tests__/mocks/notification.repository'
import { createMockSqlClient } from '@lily/api/__tests__/mocks/sql-client'
import type { CanopyEvent } from '@lily/api/contexts/canopy'
import { CanopyLive } from '@lily/api/contexts/canopy/canopy'
import type {
  Account,
  CanopyState,
  Held,
  Invitation,
} from '@lily/api/contexts/canopy/domain/canopy'
import { CanopyWrite, RoomMove } from '@lily/api/contexts/canopy/domain/decide'
import {
  allMoved,
  allWritten,
  CanopyStore,
  Find,
  InvitationScope,
  type LockPlan,
  PlantScope,
  RoomScope,
} from '@lily/api/contexts/canopy/store'
import { Outbox } from '@lily/api/kernel/outbox'
import type { DelegationRepository } from '@lily/api/repositories/delegation.repository'
import {
  ownerColumns,
  ownerOf,
} from '@lily/api/repositories/helpers/plant-owner'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import type { LimitChecker } from '@lily/api/services/subscriptions/limit-checker'
import type { CanopyId, User } from '@lily/shared'
import type { Notification } from '@lily/shared/notification'
import {
  Array,
  DateTime,
  Effect,
  Equal,
  Layer,
  Option,
  Order,
  pipe,
} from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export interface MockOwnedPlant {
  readonly id: string
  userId: string | null
  canopyId: string | null
  createdByUserId?: string | null
  roomId?: string | null
  readonly diedAt: Date | null
}

export interface MockOwnedRoom {
  readonly id: string
  userId: string | null
  canopyId: string | null
}

export interface MockCanopySurroundings {
  readonly plants?: Array<MockOwnedPlant>
  readonly rooms?: Array<MockOwnedRoom>
  readonly lockFailure?: (plan: LockPlan) => Option.Option<SqlError>
  readonly delegations?: Layer.Layer<DelegationRepository>
  readonly limits?: Layer.Layer<LimitChecker>
}

type AccountSource = Pick<User, 'id' | 'timezone' | 'latitude' | 'longitude'> &
  Partial<Pick<User, 'name' | 'language' | 'status' | 'deletedAt'>>

const toAccount = (user: AccountSource): Account => ({
  userId: user.id,
  name: user.name ?? null,
  language: user.language ?? 'en',
  timezone: user.timezone,
  location:
    user.latitude === null || user.longitude === null
      ? Option.none()
      : Option.some({ latitude: user.latitude, longitude: user.longitude }),
  reachable:
    (user.status ?? 'active') === 'active' && (user.deletedAt ?? null) === null,
})

const byJoinDate = Order.mapInput(
  Order.Date,
  (member: { readonly joinedAt: Date }) => member.joinedAt
)

const byId = Order.mapInput(
  Order.String,
  (row: { readonly id: string }) => row.id
)

const keep = <A>(rows: A[], kept: (row: A) => boolean): number => {
  const staying = Array.filter(rows, kept)
  const dropped = rows.length - staying.length
  rows.splice(0, rows.length, ...staying)
  return dropped
}

export const createInMemoryCanopy = (
  data: MockCanopyStore = createCanopyStore(),
  users: ReadonlyArray<AccountSource> = [],
  around: MockCanopySurroundings = {}
) => {
  const plantRows: Array<MockOwnedPlant> = around.plants ?? data.plants
  const roomRows: Array<MockOwnedRoom> = around.rooms ?? data.rooms
  const events: CanopyEvent[] = []
  const writes: CanopyWrite[] = []
  const plans: LockPlan[] = []
  const notifications: Notification[] = []

  const membershipOf = (userId: string) =>
    Array.findFirst(data.members, (member) => member.userId === userId)

  const canopyOf = (userId: string) =>
    Option.map(membershipOf(userId), (member) => member.canopyId)

  const stateOf = (canopyId: CanopyId): Option.Option<CanopyState> =>
    Option.map(
      Array.findFirst(data.canopies, (canopy) => canopy.id === canopyId),
      (canopy) => ({
        id: canopyId,
        name: canopy.name,
        timezone: canopy.timezone,
        members: pipe(
          data.members,
          Array.filter((member) => member.canopyId === canopyId),
          Array.sort(byJoinDate),
          Array.map(({ userId, role, joinedAt }) => ({
            userId,
            role,
            joinedAt: DateTime.makeUnsafe(joinedAt),
          }))
        ),
        link: Option.map(
          Array.findFirst(
            data.invites,
            (link) => link.canopyId === canopyId && link.revokedAt === null
          ),
          (link) => ({
            tokenHash: link.tokenHash,
            expiresAt: DateTime.makeUnsafe(link.expiresAt),
          })
        ),
      })
    )

  const accountOf = (userId: string): Option.Option<Account> =>
    pipe(
      Array.findFirst(users, (user) => user.id === userId),
      Option.map(toAccount),
      Option.orElse(() =>
        Option.map(membershipOf(userId), (member) => ({
          userId,
          name: member.name ?? null,
          language: member.language ?? 'en',
          timezone: null,
          location: Option.none(),
          reachable: true,
        }))
      )
    )

  const load = (plan: LockPlan): Held => {
    const canopy = Find.$match(plan.canopy, {
      None: () => Option.none<CanopyState>(),
      OfMember: ({ userId }) => Option.flatMap(canopyOf(userId), stateOf),
      ByLink: ({ tokenHash }) =>
        pipe(
          Array.findFirst(data.invites, (link) => link.tokenHash === tokenHash),
          Option.flatMap((link) => stateOf(link.canopyId as CanopyId))
        ),
      ByInvitation: ({ invitationId }) =>
        pipe(
          Array.findFirst(data.invitations, (row) => row.id === invitationId),
          Option.flatMap((row) => stateOf(row.canopyId as CanopyId))
        ),
    })
    const ofHeldCanopy = (row: { readonly canopyId: string }) =>
      Option.match(canopy, {
        onNone: () => true,
        onSome: (state) => state.id === row.canopyId,
      })
    const inHeldCanopy = (row: { readonly canopyId: string | null }) =>
      Option.exists(canopy, (state) => state.id === row.canopyId)
    return {
      canopy,
      actorCanopy: pipe(
        plan.actor,
        Option.flatMap(canopyOf),
        Option.map((canopyId) => ({
          canopyId,
          name: pipe(
            Array.findFirst(data.canopies, (c) => c.id === canopyId),
            Option.map((c) => c.name),
            Option.getOrElse(() => '')
          ),
        }))
      ),
      accounts: new Map(
        pipe(
          [
            ...Option.toArray(plan.actor),
            ...plan.accounts,
            ...pipe(
              Option.toArray(canopy),
              Array.flatMap((state) => state.members),
              Array.map((member) => member.userId)
            ),
          ],
          Array.flatMap((userId) => Option.toArray(accountOf(userId))),
          Array.map((account) => [account.userId, account] as const)
        )
      ),
      invitations: pipe(
        InvitationScope.$match(plan.invitations, {
          None: () => [],
          One: ({ invitationId }) =>
            Array.filter(
              data.invitations,
              (row) => row.id === invitationId && ofHeldCanopy(row)
            ),
          OfInvitee: ({ invitee }) =>
            Array.filter(
              data.invitations,
              (row) => row.inviteeUserId === invitee && inHeldCanopy(row)
            ),
          All: () => Array.filter(data.invitations, inHeldCanopy),
        }),
        Array.map(
          (row): Invitation => ({
            id: row.id,
            invitee: row.inviteeUserId,
            invitedBy: row.invitedByUserId,
            status: row.status,
            expiresAt: row.expiresAt,
            resolvedAt: row.resolvedAt,
          })
        )
      ),
      rooms: pipe(
        RoomScope.$match(plan.rooms, {
          None: () => [],
          Pin: ({ roomId }) =>
            Array.filter(roomRows, (room) => room.id === roomId),
          OfCanopy: () => Array.filter(roomRows, inHeldCanopy),
        }),
        Array.map((room) => ({ id: room.id, owner: ownerOf(room) }))
      ),
      plants: pipe(
        PlantScope.$match(plan.plants, {
          None: () => [],
          Move: ({ plantId }) =>
            Array.filter(plantRows, (plant) => plant.id === plantId),
          Pin: ({ plantId }) =>
            Array.filter(plantRows, (plant) => plant.id === plantId),
          OfCanopy: () => Array.filter(plantRows, inHeldCanopy),
        }),
        Array.sort(byId),
        Array.map((plant) => ({
          id: plant.id,
          owner: ownerOf(plant),
          sharer: Option.fromNullishOr(plant.createdByUserId),
          living: plant.diedAt === null,
        }))
      ),
    }
  }

  const revokeLinks = (
    canopyId: string,
    at: DateTime.Utc,
    createdBy: Option.Option<string>
  ) =>
    Array.forEach(data.invites, (link) => {
      if (
        link.canopyId === canopyId &&
        link.revokedAt === null &&
        Option.match(createdBy, {
          onNone: () => true,
          onSome: (userId) => link.createdByUserId === userId,
        })
      ) {
        link.revokedAt = DateTime.toDateUtc(at)
      }
    })

  const change =
    <W>(mutate: (write: W) => void) =>
    (write: W): Effect.Effect<void> =>
      Effect.sync(() => mutate(write))

  const roomColumn = RoomMove.$match({
    Keep: () => ({}),
    Clear: () => ({ roomId: null }),
    Put: ({ roomId }) => ({ roomId }),
  })

  const canopyPlants = (canopyId: string) =>
    pipe(
      Array.filter(plantRows, (plant) => plant.canopyId === canopyId),
      Array.map((plant) => plant.id)
    )

  const isMember =
    (of: { readonly canopyId: string; readonly userId: string }) =>
    (member: { readonly canopyId: string; readonly userId: string }) =>
      member.canopyId === of.canopyId && member.userId === of.userId

  const isMute =
    (of: { readonly userId: string; readonly plantId: string }) =>
    (mute: { readonly userId: string; readonly plantId: string }) =>
      mute.userId === of.userId && mute.plantId === of.plantId

  const applyWith = (notificationRepo: NotificationRepository['Service']) =>
    CanopyWrite.$match({
      CreateCanopy: change((w) => {
        data.canopies.push(
          createTestCanopyRow({
            id: w.id,
            name: w.name,
            timezone: w.timezone,
            latitude: Option.getOrNull(
              Option.map(w.location, (l) => l.latitude)
            ),
            longitude: Option.getOrNull(
              Option.map(w.location, (l) => l.longitude)
            ),
          })
        )
      }),
      UpdateCanopy: change((w) =>
        Array.forEach(data.canopies, (canopy) => {
          if (canopy.id !== w.canopyId) return
          Object.assign(canopy, {
            name: Option.getOrElse(w.changes.name, () => canopy.name),
            timezone: Option.getOrElse(
              w.changes.timezone,
              () => canopy.timezone
            ),
            latitude: Option.getOrElse(
              w.changes.latitude,
              () => canopy.latitude
            ),
            longitude: Option.getOrElse(
              w.changes.longitude,
              () => canopy.longitude
            ),
            updatedAt: new Date(),
          })
        })
      ),
      DeleteCanopy: change((w) => {
        if (
          Array.some(
            [...plantRows, ...roomRows],
            (row) => row.canopyId === w.canopyId
          )
        ) {
          throw new Error('canopy still holds a plant or a room')
        }
        const elsewhere = (row: { readonly canopyId: string }) =>
          row.canopyId !== w.canopyId
        keep(data.canopies, (canopy) => canopy.id !== w.canopyId)
        keep(data.members, elsewhere)
        keep(data.invites, elsewhere)
        keep(data.invitations, elsewhere)
      }),
      AddMember: change((w) => {
        if (Option.isSome(canopyOf(w.userId))) {
          throw new Error('canopy_members_user_id_unique')
        }
        data.members.push({
          canopyId: w.canopyId,
          userId: w.userId,
          role: w.role,
          joinedAt: DateTime.toDateUtc(w.at),
        })
      }),
      RemoveMember: (w) =>
        Effect.gen(function* () {
          const held = canopyPlants(w.canopyId)
          keep(
            data.mutes,
            (mute) =>
              mute.userId !== w.userId || !Array.contains(held, mute.plantId)
          )
          const removed = keep(data.members, (member) => !isMember(w)(member))
          yield* allWritten('RemoveMember', 1, removed)
          yield* notificationRepo.deleteUndeliveredNonCareForMemberOnCanopy(
            w.userId,
            w.canopyId
          )
        }),
      SetOwner: (w) =>
        Effect.suspend(() => {
          if (
            Array.some(
              data.members,
              (member) =>
                member.canopyId === w.canopyId && member.role === 'owner'
            )
          ) {
            throw new Error('canopy_members_one_owner_unique')
          }
          const promoted = Array.filter(data.members, isMember(w))
          Array.forEach(promoted, (member) => {
            data.members.splice(data.members.indexOf(member), 1, {
              ...member,
              role: 'owner',
            })
          })
          return allWritten('SetOwner', 1, promoted.length)
        }),
      ReplaceLink: change((w) => {
        revokeLinks(w.canopyId, w.at, Option.none())
        data.invites.push({
          canopyId: w.canopyId,
          tokenHash: w.tokenHash,
          createdByUserId: w.createdBy,
          expiresAt: DateTime.toDateUtc(w.expiresAt),
          revokedAt: null,
        })
      }),
      RevokeLinks: change((w) =>
        revokeLinks(w.canopyId, w.at, w.onlyCreatedBy)
      ),
      OpenInvitation: change((w) => {
        const opened = {
          invitedByUserId: w.invitedBy,
          status: 'pending' as const,
          expiresAt: DateTime.toDateUtc(w.expiresAt),
          resolvedAt: null,
          createdAt: DateTime.toDateUtc(w.at),
        }
        const reopened = Array.filter(
          data.invitations,
          (row) => row.id === w.id
        )
        Array.forEach(reopened, (row) => {
          Object.assign(row, opened)
        })
        if (Array.isReadonlyArrayNonEmpty(reopened)) return
        if (
          Array.some(
            data.invitations,
            (row) =>
              row.canopyId === w.canopyId && row.inviteeUserId === w.invitee
          )
        ) {
          throw new Error('canopy_direct_invites_pair_unique')
        }
        data.invitations.push({
          id: w.id,
          canopyId: w.canopyId,
          inviteeUserId: w.invitee,
          ...opened,
        })
      }),
      ResolveInvitation: change((w) =>
        Array.forEach(data.invitations, (row) => {
          if (row.id !== w.id) return
          Object.assign(row, {
            status: w.to,
            resolvedAt: DateTime.toDateUtc(w.at),
          })
        })
      ),
      WithdrawInvitationsSentBy: change((w) =>
        Array.forEach(data.invitations, (row) => {
          if (
            row.canopyId !== w.canopyId ||
            row.invitedByUserId !== w.userId ||
            row.status !== 'pending'
          ) {
            return
          }
          Object.assign(row, {
            status: 'withdrawn',
            resolvedAt: DateTime.toDateUtc(w.at),
          })
        })
      ),
      Mute: change((w) => {
        if (!Array.some(plantRows, (plant) => plant.id === w.plantId)) {
          throw new Error('canopy_plant_mutes_plant_id_plants_id_fk')
        }
        if (!Array.some(data.mutes, isMute(w))) {
          data.mutes.push({ userId: w.userId, plantId: w.plantId })
        }
      }),
      Unmute: change((w) => {
        keep(data.mutes, (mute) => !isMute(w)(mute))
      }),
      MoveRooms: (w) =>
        Effect.suspend(() => {
          const moving = Array.filter(
            roomRows,
            (room) =>
              Array.contains(w.roomIds, room.id) && room.canopyId === w.canopyId
          )
          Array.forEach(moving, (room) => {
            Object.assign(room, { userId: w.toUserId, canopyId: null })
          })
          return allWritten('MoveRooms', w.roomIds.length, moving.length)
        }),
      MovePlants: (w) =>
        Effect.gen(function* () {
          const moving = Array.filter(
            plantRows,
            (plant) =>
              Array.contains(w.plantIds, plant.id) &&
              Equal.equals(ownerOf(plant), w.from)
          )
          Array.forEach(moving, (plant) => {
            Object.assign(plant, {
              ...ownerColumns(w.to),
              ...roomColumn(w.room),
              updatedAt: new Date(),
            })
          })
          yield* allMoved(w.plantIds, moving.length)
          if (w.from._tag !== 'Canopy') return
          keep(data.mutes, (mute) => !Array.contains(w.plantIds, mute.plantId))
          yield* notificationRepo.deleteUndeliveredNonCareOfNonOwners(
            w.plantIds
          )
        }),
    })

  const store = Layer.effect(
    CanopyStore,
    Effect.map(NotificationRepository, (notificationRepo) => {
      const applyOne = applyWith(notificationRepo)
      return CanopyStore.of({
        lockAndLoad: (plan) =>
          Effect.suspend(() => {
            plans.push(plan)
            return pipe(
              Option.fromNullishOr(around.lockFailure),
              Option.flatMap((failureOf) => failureOf(plan)),
              Option.match({
                onNone: () => Effect.succeed(load(plan)),
                onSome: (error) => Effect.fail(error),
              })
            )
          }),
        apply: (applied) =>
          Effect.forEach(
            applied,
            (write) =>
              Effect.suspend(() => {
                writes.push(write)
                return applyOne(write)
              }),
            { discard: true }
          ),
      })
    })
  )
  const outbox = Layer.succeed(
    Outbox,
    Outbox.of({
      append: (_to, appended) =>
        Effect.sync(() => {
          events.push(...(appended as ReadonlyArray<CanopyEvent>))
        }),
      wake: Effect.void,
      drain: Effect.succeed(0),
      redrive: () => Effect.succeed(0),
    })
  )
  const service = CanopyLive.pipe(
    Layer.provide(store),
    Layer.provide(
      Layer.mergeAll(
        around.delegations ?? createMockDelegationRepository(),
        around.limits ?? createMockLimitChecker()
      )
    )
  )
  const notificationsLive = createMockNotificationRepository(notifications, {
    canopyPlants,
    plantOwner: (plantId) =>
      pipe(
        Array.findFirst(plantRows, (plant) => plant.id === plantId),
        Option.flatMapNullishOr((plant) => plant.userId),
        Option.getOrNull
      ),
  })

  return {
    store: data,
    events,
    writes,
    plans,
    notifications,
    service,
    storeLayer: Layer.provide(store, notificationsLive),
    layer: service.pipe(
      Layer.provide(
        Layer.mergeAll(
          outbox,
          createMockSqlClient(),
          notificationsLive,
          createMockMessageQueue()
        )
      )
    ),
  }
}
