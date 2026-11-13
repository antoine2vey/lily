import { Absence } from '@lily/api/contexts/absence'
import {
  type Account,
  type CanopyState,
  HELD_NOTHING,
  type Held,
  memberOf,
} from '@lily/api/contexts/canopy/domain/canopy'
import { CanopyWrite, RoomMove } from '@lily/api/contexts/canopy/domain/decide'
import { lockUser } from '@lily/api/kernel/locks'
import {
  ownedBy,
  ownerColumns,
  ownerOf,
  sameOwner,
} from '@lily/api/repositories/helpers/plant-owner'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import * as PgDrizzle from '@lily/db/effect-drizzle'
import {
  canopies,
  canopyDirectInvites,
  canopyInvites,
  canopyMembers,
  canopyPlantMutes,
  carePlans,
  plants,
  rooms,
  users,
} from '@lily/db/schema'
import {
  type CanopyId,
  type LanguageCode,
  nowAsDate,
  type PlantOwner,
  type UserStatus,
} from '@lily/shared'
import { and, asc, eq, inArray, isNull, or, type SQL, sql } from 'drizzle-orm'
import {
  Array,
  Context,
  Data,
  DateTime,
  Effect,
  Layer,
  Match,
  Option,
  pipe,
} from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

export type Find = Data.TaggedEnum<{
  None: Record<never, never>
  OfMember: { readonly userId: string }
  ByLink: { readonly tokenHash: string }
  ByInvitation: { readonly invitationId: string }
}>
export const Find = Data.taggedEnum<Find>()

export type InvitationScope = Data.TaggedEnum<{
  None: Record<never, never>
  One: { readonly invitationId: string }
  OfInvitee: { readonly invitee: string }
  All: Record<never, never>
}>
export const InvitationScope = Data.taggedEnum<InvitationScope>()

export type RoomScope = Data.TaggedEnum<{
  None: Record<never, never>
  Pin: { readonly roomId: string }
  OfCanopy: Record<never, never>
}>
export const RoomScope = Data.taggedEnum<RoomScope>()

export type PlantScope = Data.TaggedEnum<{
  None: Record<never, never>
  Move: { readonly plantId: string }
  Pin: { readonly plantId: string }
  OfCanopy: Record<never, never>
  Leaver: { readonly userId: string }
}>
export const PlantScope = Data.taggedEnum<PlantScope>()

export interface LockPlan {
  readonly actor: Option.Option<string>
  readonly canopy: Find
  readonly absenceOf: Option.Option<string>
  readonly accounts: ReadonlyArray<string>
  readonly invitations: InvitationScope
  /**
   * Room rows in id order. Before plants, as a room delete takes its row
   * and then the plants in it.
   */
  readonly rooms: RoomScope
  readonly plants: PlantScope
}

const LOCK_NOTHING: LockPlan = {
  actor: Option.none(),
  canopy: Find.None(),
  absenceOf: Option.none(),
  accounts: [],
  invitations: InvitationScope.None(),
  rooms: RoomScope.None(),
  plants: PlantScope.None(),
}

export const lockPlan = (classes: Partial<LockPlan>): LockPlan => ({
  ...LOCK_NOTHING,
  ...classes,
})

export class CanopyStore extends Context.Service<
  CanopyStore,
  {
    readonly lockAndLoad: (plan: LockPlan) => Effect.Effect<Held, SqlError>
    readonly apply: (
      writes: ReadonlyArray<CanopyWrite>
    ) => Effect.Effect<void, SqlError>
  }
>()('canopy/CanopyStore') {}

export class PlantsNotMovedDefect extends Data.TaggedError(
  'PlantsNotMovedDefect'
)<{
  readonly plantIds: ReadonlyArray<string>
  readonly moved: number
}> {}

export const allMoved = (
  plantIds: ReadonlyArray<string>,
  moved: number
): Effect.Effect<void> =>
  moved === plantIds.length
    ? Effect.void
    : Effect.die(new PlantsNotMovedDefect({ plantIds, moved }))

export class RowsNotWrittenDefect extends Data.TaggedError(
  'RowsNotWrittenDefect'
)<{
  readonly write: 'MoveRooms' | 'RemoveMember' | 'SetOwner'
  readonly named: number
  readonly written: number
}> {}

export const allWritten = (
  write: RowsNotWrittenDefect['write'],
  named: number,
  written: number
): Effect.Effect<void> =>
  written === named
    ? Effect.void
    : Effect.die(new RowsNotWrittenDefect({ write, named, written }))

type LockClass = (plan: LockPlan, held: Held) => Effect.Effect<Held, SqlError>

const toAccount = (row: {
  readonly id: string
  readonly name: string | null
  readonly language: LanguageCode
  readonly timezone: string | null
  readonly latitude: number | null
  readonly longitude: number | null
  readonly status: UserStatus
  readonly deletedAt: Date | null
}): Account => ({
  userId: row.id,
  name: row.name,
  language: row.language,
  timezone: row.timezone,
  location:
    row.latitude === null || row.longitude === null
      ? Option.none()
      : Option.some({ latitude: row.latitude, longitude: row.longitude }),
  reachable: row.status === 'active' && row.deletedAt === null,
})

export const CanopyStoreLive = Layer.effect(
  CanopyStore,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle
    const client = yield* SqlClient.SqlClient
    const notifications = yield* NotificationRepository
    const absence = yield* Absence

    const canopyOf = (userId: string) =>
      Effect.map(
        db
          .select({ canopyId: canopyMembers.canopyId, name: canopies.name })
          .from(canopyMembers)
          .innerJoin(canopies, eq(canopies.id, canopyMembers.canopyId))
          .where(eq(canopyMembers.userId, userId)),
        (rows) =>
          Option.map(Array.head(rows), (row) => ({
            canopyId: row.canopyId as CanopyId,
            name: row.name,
          }))
      )

    const actor: LockClass = (plan, held) =>
      Option.match(plan.actor, {
        onNone: () => Effect.succeed(held),
        onSome: (userId) =>
          lockUser(userId).pipe(
            Effect.provideService(SqlClient.SqlClient, client),
            Effect.andThen(canopyOf(userId)),
            Effect.map((actorCanopy) => ({ ...held, actorCanopy }))
          ),
      })

    const firstCanopyId = (
      rows: ReadonlyArray<{ readonly canopyId: string }>
    ) => Option.map(Array.head(rows), (row) => row.canopyId as CanopyId)

    const sought = Find.$match({
      None: () => ({
        id: Effect.succeed(Option.none<CanopyId>()),
        holds: () => false,
      }),
      OfMember: ({ userId }) => ({
        id: Effect.map(
          canopyOf(userId),
          Option.map((found) => found.canopyId)
        ),
        holds: (state: CanopyState) => Option.isSome(memberOf(state, userId)),
      }),
      ByLink: ({ tokenHash }) => ({
        id: Effect.map(
          db
            .select({ canopyId: canopyInvites.canopyId })
            .from(canopyInvites)
            .where(eq(canopyInvites.tokenHash, tokenHash)),
          firstCanopyId
        ),
        holds: () => true,
      }),
      ByInvitation: ({ invitationId }) => ({
        id: Effect.map(
          db
            .select({ canopyId: canopyDirectInvites.canopyId })
            .from(canopyDirectInvites)
            .where(eq(canopyDirectInvites.id, invitationId)),
          firstCanopyId
        ),
        holds: () => true,
      }),
    })

    const liveLinkOf = (canopyId: CanopyId) =>
      and(eq(canopyInvites.canopyId, canopyId), isNull(canopyInvites.revokedAt))

    const lockedCanopy = (canopyId: CanopyId) =>
      Effect.gen(function* () {
        const rows = yield* db
          .select({ name: canopies.name, timezone: canopies.timezone })
          .from(canopies)
          .where(eq(canopies.id, canopyId))
          .for('update')
        const members = yield* db
          .select({
            userId: canopyMembers.userId,
            role: canopyMembers.role,
            joinedAt: canopyMembers.joinedAt,
          })
          .from(canopyMembers)
          .where(eq(canopyMembers.canopyId, canopyId))
          .orderBy(asc(canopyMembers.joinedAt), asc(canopyMembers.id))
        const links = yield* db
          .select({
            tokenHash: canopyInvites.tokenHash,
            expiresAt: canopyInvites.expiresAt,
          })
          .from(canopyInvites)
          .where(liveLinkOf(canopyId))
        return Option.map(
          Array.head(rows),
          (row): CanopyState => ({
            id: canopyId,
            name: row.name,
            timezone: row.timezone,
            members: Array.map(members, (member) => ({
              ...member,
              joinedAt: DateTime.makeUnsafe(member.joinedAt),
            })),
            link: Option.map(Array.head(links), (link) => ({
              tokenHash: link.tokenHash,
              expiresAt: DateTime.makeUnsafe(link.expiresAt),
            })),
          })
        )
      })

    const canopy: LockClass = (plan, held) => {
      const { id, holds } = sought(plan.canopy)
      return id.pipe(
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.succeed(Option.none<CanopyState>()),
            onSome: lockedCanopy,
          })
        ),
        Effect.map((locked) => ({
          ...held,
          canopy: Option.filter(locked, holds),
        }))
      )
    }

    const accountColumns = {
      id: users.id,
      name: users.name,
      language: users.language,
      timezone: users.timezone,
      latitude: users.latitude,
      longitude: users.longitude,
      status: users.status,
      deletedAt: users.deletedAt,
    }

    const accounts: LockClass = (plan, held) =>
      Effect.gen(function* () {
        const named = Array.dedupe(plan.accounts)
        const known = Array.difference(
          Array.dedupe([
            ...Option.toArray(plan.actor),
            ...pipe(
              Option.toArray(held.canopy),
              Array.flatMap((state) => state.members),
              Array.map((member) => member.userId)
            ),
          ]),
          named
        )
        const locked = Array.isReadonlyArrayEmpty(named)
          ? []
          : yield* db
              .select(accountColumns)
              .from(users)
              .where(inArray(users.id, named))
              .orderBy(asc(users.id))
              .for('key share')
        const read = Array.isReadonlyArrayEmpty(known)
          ? []
          : yield* db
              .select(accountColumns)
              .from(users)
              .where(inArray(users.id, known))
        return {
          ...held,
          accounts: new Map(
            Array.map([...locked, ...read], (row) => [row.id, toAccount(row)])
          ),
        }
      })

    const absenceOf: LockClass = (plan, held) =>
      Option.match(plan.absenceOf, {
        onNone: () => Effect.succeed(held),
        onSome: (userId) => Effect.as(absence.holdForDeletion(userId), held),
      })

    const ofHeldCanopy = (
      held: Held,
      lock: (canopy: CanopyState) => Effect.Effect<Held, SqlError>
    ) =>
      Option.match(held.canopy, {
        onNone: () => Effect.succeed(held),
        onSome: lock,
      })

    const invitationsWhere = (held: Held, where: SQL | undefined) =>
      Effect.map(
        db
          .select({
            id: canopyDirectInvites.id,
            invitee: canopyDirectInvites.inviteeUserId,
            invitedBy: canopyDirectInvites.invitedByUserId,
            status: canopyDirectInvites.status,
            expiresAt: canopyDirectInvites.expiresAt,
            resolvedAt: canopyDirectInvites.resolvedAt,
          })
          .from(canopyDirectInvites)
          .where(where)
          .orderBy(asc(canopyDirectInvites.id))
          .for('update'),
        (rows) => ({ ...held, invitations: rows })
      )

    const invitations: LockClass = (plan, held) =>
      InvitationScope.$match(plan.invitations, {
        None: () => Effect.succeed(held),
        One: ({ invitationId }) =>
          invitationsWhere(
            held,
            and(
              eq(canopyDirectInvites.id, invitationId),
              Option.getOrUndefined(
                Option.map(held.canopy, (state) =>
                  eq(canopyDirectInvites.canopyId, state.id)
                )
              )
            )
          ),
        OfInvitee: ({ invitee }) =>
          ofHeldCanopy(held, (state) =>
            invitationsWhere(
              held,
              and(
                eq(canopyDirectInvites.canopyId, state.id),
                eq(canopyDirectInvites.inviteeUserId, invitee)
              )
            )
          ),
        All: () =>
          ofHeldCanopy(held, (state) =>
            invitationsWhere(held, eq(canopyDirectInvites.canopyId, state.id))
          ),
      })

    const roomsWhere = (
      held: Held,
      where: SQL,
      strength: 'key share' | 'no key update'
    ) =>
      Effect.map(
        db
          .select({
            id: rooms.id,
            userId: rooms.userId,
            canopyId: rooms.canopyId,
          })
          .from(rooms)
          .where(where)
          .orderBy(asc(rooms.id))
          .for(strength),
        (rows) => ({
          ...held,
          rooms: Array.map(rows, (row) => ({
            id: row.id,
            owner: ownerOf(row),
          })),
        })
      )

    const heldRooms: LockClass = (plan, held) =>
      RoomScope.$match(plan.rooms, {
        None: () => Effect.succeed(held),
        Pin: ({ roomId }) =>
          roomsWhere(held, eq(rooms.id, roomId), 'key share'),
        OfCanopy: () =>
          ofHeldCanopy(held, (state) =>
            roomsWhere(held, eq(rooms.canopyId, state.id), 'no key update')
          ),
      })

    const lockedPlants = (
      where: SQL | undefined,
      strength: 'key share' | 'no key update'
    ) =>
      Effect.map(
        db
          .select({
            id: plants.id,
            userId: plants.userId,
            canopyId: plants.canopyId,
            sharer: plants.createdByUserId,
            diedAt: plants.diedAt,
          })
          .from(plants)
          .where(where)
          .orderBy(asc(plants.id))
          .for(strength),
        Array.map((row) => ({
          id: row.id,
          owner: ownerOf(row),
          sharer: Option.fromNullishOr(row.sharer),
          living: row.diedAt === null,
        }))
      )

    const plantsWhere = (
      held: Held,
      where: SQL,
      strength: 'key share' | 'no key update'
    ) =>
      Effect.map(lockedPlants(where, strength), (locked) => ({
        ...held,
        plants: locked,
      }))

    const plantsTheAccountDeleteWrites = (held: Held, userId: string) =>
      Effect.map(
        lockedPlants(
          or(
            ...Option.toArray(
              Option.map(held.canopy, (state) => eq(plants.canopyId, state.id))
            ),
            eq(plants.userId, userId),
            eq(plants.createdByUserId, userId),
            inArray(
              plants.id,
              db
                .select({ plantId: carePlans.plantId })
                .from(carePlans)
                .where(eq(carePlans.userId, userId))
            )
          ),
          'no key update'
        ),
        (locked) => ({
          ...held,
          plants: Option.match(held.canopy, {
            onNone: () => [],
            onSome: (state) =>
              Array.filter(locked, (plant) =>
                sameOwner(plant.owner, { _tag: 'Canopy', canopyId: state.id })
              ),
          }),
        })
      )

    const heldPlants: LockClass = (plan, held) =>
      PlantScope.$match(plan.plants, {
        None: () => Effect.succeed(held),
        Move: ({ plantId }) =>
          plantsWhere(held, eq(plants.id, plantId), 'no key update'),
        Pin: ({ plantId }) =>
          plantsWhere(held, eq(plants.id, plantId), 'key share'),
        OfCanopy: () =>
          ofHeldCanopy(held, (state) =>
            plantsWhere(held, eq(plants.canopyId, state.id), 'no key update')
          ),
        Leaver: ({ userId }) => plantsTheAccountDeleteWrites(held, userId),
      })

    const IN_LOCK_ORDER: ReadonlyArray<LockClass> = [
      actor,
      canopy,
      absenceOf,
      accounts,
      invitations,
      heldRooms,
      heldPlants,
    ]

    const roomColumn = RoomMove.$match({
      Keep: () => ({}),
      Clear: () => ({ roomId: null }),
      Put: ({ roomId }) => ({ roomId }),
    })

    const dropWhatTheCanopyHeld: (
      from: PlantOwner
    ) => (plantIds: ReadonlyArray<string>) => Effect.Effect<void, SqlError> =
      Match.type<PlantOwner>().pipe(
        Match.tagsExhaustive({
          User: () => () => Effect.void,
          Canopy: () => (plantIds: ReadonlyArray<string>) =>
            Effect.andThen(
              db
                .delete(canopyPlantMutes)
                .where(inArray(canopyPlantMutes.plantId, [...plantIds])),
              notifications.deleteUndeliveredNonCareOfNonOwners(plantIds)
            ),
        })
      )

    const memberRow = (member: {
      readonly canopyId: CanopyId
      readonly userId: string
    }) =>
      and(
        eq(canopyMembers.canopyId, member.canopyId),
        eq(canopyMembers.userId, member.userId)
      )

    const write: (write: CanopyWrite) => Effect.Effect<void, SqlError> =
      CanopyWrite.$match({
        CreateCanopy: (w) =>
          Effect.asVoid(
            db.insert(canopies).values({
              id: w.id,
              name: w.name,
              timezone: w.timezone,
              latitude: Option.getOrNull(
                Option.map(w.location, (location) => location.latitude)
              ),
              longitude: Option.getOrNull(
                Option.map(w.location, (location) => location.longitude)
              ),
            })
          ),
        UpdateCanopy: (w) =>
          Effect.asVoid(
            db
              .update(canopies)
              .set({
                name: Option.getOrUndefined(w.changes.name),
                timezone: Option.getOrUndefined(w.changes.timezone),
                latitude: Option.getOrUndefined(w.changes.latitude),
                longitude: Option.getOrUndefined(w.changes.longitude),
              })
              .where(eq(canopies.id, w.canopyId))
          ),
        DeleteCanopy: (w) =>
          Effect.asVoid(db.delete(canopies).where(eq(canopies.id, w.canopyId))),
        AddMember: (w) =>
          Effect.asVoid(
            db.insert(canopyMembers).values({
              canopyId: w.canopyId,
              userId: w.userId,
              role: w.role,
              joinedAt: DateTime.toDateUtc(w.at),
            })
          ),
        RemoveMember: (w) =>
          Effect.gen(function* () {
            yield* db
              .delete(canopyPlantMutes)
              .where(
                and(
                  eq(canopyPlantMutes.userId, w.userId),
                  inArray(
                    canopyPlantMutes.plantId,
                    db
                      .select({ id: plants.id })
                      .from(plants)
                      .where(eq(plants.canopyId, w.canopyId))
                  )
                )
              )
            const removed = yield* db
              .delete(canopyMembers)
              .where(memberRow(w))
              .returning({ id: canopyMembers.id })
            yield* allWritten('RemoveMember', 1, removed.length)
            yield* notifications.deleteUndeliveredNonCareForMemberOnCanopy(
              w.userId,
              w.canopyId
            )
          }),
        SetOwner: (w) =>
          Effect.flatMap(
            db
              .update(canopyMembers)
              .set({ role: 'owner' })
              .where(memberRow(w))
              .returning({ id: canopyMembers.id }),
            (promoted) => allWritten('SetOwner', 1, promoted.length)
          ),
        ReplaceLink: (w) =>
          Effect.asVoid(
            Effect.andThen(
              db
                .update(canopyInvites)
                .set({ revokedAt: DateTime.toDateUtc(w.at) })
                .where(liveLinkOf(w.canopyId)),
              db.insert(canopyInvites).values({
                canopyId: w.canopyId,
                tokenHash: w.tokenHash,
                createdByUserId: w.createdBy,
                expiresAt: DateTime.toDateUtc(w.expiresAt),
                createdAt: DateTime.toDateUtc(w.at),
              })
            )
          ),
        RevokeLinks: (w) =>
          Effect.asVoid(
            db
              .update(canopyInvites)
              .set({ revokedAt: DateTime.toDateUtc(w.at) })
              .where(
                and(
                  liveLinkOf(w.canopyId),
                  Option.getOrUndefined(
                    Option.map(w.onlyCreatedBy, (userId) =>
                      eq(canopyInvites.createdByUserId, userId)
                    )
                  )
                )
              )
          ),
        OpenInvitation: (w) => {
          const opened = {
            invitedByUserId: w.invitedBy,
            status: 'pending' as const,
            expiresAt: DateTime.toDateUtc(w.expiresAt),
            resolvedAt: null,
            createdAt: DateTime.toDateUtc(w.at),
          }
          return Effect.asVoid(
            db
              .insert(canopyDirectInvites)
              .values({
                id: w.id,
                canopyId: w.canopyId,
                inviteeUserId: w.invitee,
                ...opened,
              })
              .onConflictDoUpdate({
                target: canopyDirectInvites.id,
                set: opened,
              })
          )
        },
        ResolveInvitation: (w) =>
          Effect.asVoid(
            db
              .update(canopyDirectInvites)
              .set({ status: w.to, resolvedAt: DateTime.toDateUtc(w.at) })
              .where(eq(canopyDirectInvites.id, w.id))
          ),
        WithdrawInvitationsSentBy: (w) =>
          Effect.asVoid(
            db
              .update(canopyDirectInvites)
              .set({
                status: 'withdrawn',
                resolvedAt: DateTime.toDateUtc(w.at),
              })
              .where(
                and(
                  eq(canopyDirectInvites.canopyId, w.canopyId),
                  eq(canopyDirectInvites.invitedByUserId, w.userId),
                  eq(canopyDirectInvites.status, 'pending')
                )
              )
          ),
        Mute: (w) =>
          Effect.asVoid(
            db
              .insert(canopyPlantMutes)
              .values({ userId: w.userId, plantId: w.plantId })
              .onConflictDoNothing()
          ),
        Unmute: (w) =>
          Effect.asVoid(
            db
              .delete(canopyPlantMutes)
              .where(
                and(
                  eq(canopyPlantMutes.userId, w.userId),
                  eq(canopyPlantMutes.plantId, w.plantId)
                )
              )
          ),
        MoveRooms: (w) =>
          Effect.gen(function* () {
            const own = yield* db
              .select({ last: sql<number>`coalesce(max(${rooms.order}), 0)` })
              .from(rooms)
              .where(eq(rooms.userId, w.toUserId))
            const afterOwn = pipe(
              Array.head(own),
              Option.map((row) => Number(row.last) + 1),
              Option.getOrElse(() => 1)
            )
            const moved = yield* db
              .update(rooms)
              .set({
                userId: w.toUserId,
                canopyId: null,
                order: sql`${rooms.order} + ${afterOwn}`,
                updatedAt: nowAsDate(),
              })
              .where(
                and(
                  inArray(rooms.id, [...w.roomIds]),
                  eq(rooms.canopyId, w.canopyId)
                )
              )
              .returning({ id: rooms.id })
            yield* allWritten('MoveRooms', w.roomIds.length, moved.length)
          }),
        MovePlants: (w) =>
          Effect.gen(function* () {
            const moved = yield* db
              .update(plants)
              .set({
                ...ownerColumns(w.to),
                ...roomColumn(w.room),
                updatedAt: nowAsDate(),
              })
              .where(
                and(
                  inArray(plants.id, [...w.plantIds]),
                  ownedBy(plants, w.from)
                )
              )
              .returning({ id: plants.id })
            yield* allMoved(w.plantIds, moved.length)
            yield* dropWhatTheCanopyHeld(w.from)(w.plantIds)
          }),
      })

    return CanopyStore.of({
      lockAndLoad: (plan) =>
        Effect.reduce(
          IN_LOCK_ORDER,
          () => HELD_NOTHING,
          (held, lock) => lock(plan, held)
        ).pipe(Effect.withSpan('CanopyStore.lockAndLoad')),
      apply: (writes) =>
        Effect.forEach(writes, write, { discard: true }).pipe(
          Effect.withSpan('CanopyStore.apply')
        ),
    })
  })
)
