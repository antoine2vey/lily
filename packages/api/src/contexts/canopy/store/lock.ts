import { Absence } from '@lily/api/contexts/absence'
import {
  type Account,
  type CanopyState,
  HELD_NOTHING,
  type Held,
  memberOf,
} from '@lily/api/contexts/canopy/domain/canopy'
import {
  Find,
  InvitationScope,
  type LockPlan,
  PlantScope,
  RoomScope,
} from '@lily/api/contexts/canopy/store/lock-plan'
import {
  lockRows,
  lockRowsNamed,
  lockUser,
  pinAccounts,
} from '@lily/api/kernel/locks'
import type { Transaction } from '@lily/api/kernel/transact'
import { ownerOf, sameOwner } from '@lily/api/repositories/helpers/plant-owner'
import * as PgDrizzle from '@lily/db/effect-drizzle'
import {
  canopies,
  canopyDirectInvites,
  canopyInvites,
  canopyMembers,
  carePlans,
  plants,
  rooms,
  users,
} from '@lily/db/schema'
import type { CanopyId, LanguageCode, UserStatus, ZoneName } from '@lily/shared'
import { and, asc, eq, inArray, isNull, or, type SQL } from 'drizzle-orm'
import { Array, DateTime, Effect, Option, pipe } from 'effect'
import * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'

type LockClass = (
  plan: LockPlan,
  held: Held
) => Effect.Effect<Held, SqlError, Transaction>

const toAccount = (row: {
  readonly id: string
  readonly name: string | null
  readonly language: LanguageCode
  readonly timezone: ZoneName | null
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

export const liveLinkOf = (canopyId: CanopyId) =>
  and(eq(canopyInvites.canopyId, canopyId), isNull(canopyInvites.revokedAt))

export const makeLockAndLoad = Effect.gen(function* () {
  const db = yield* PgDrizzle.PgDrizzle
  const client = yield* SqlClient.SqlClient
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

  const firstCanopyId = (rows: ReadonlyArray<{ readonly canopyId: string }>) =>
    Option.map(Array.head(rows), (row) => row.canopyId as CanopyId)

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

  const lockedCanopy = (canopyId: CanopyId) =>
    Effect.gen(function* () {
      const rows = yield* lockRowsNamed(
        'Canopy',
        'update',
        [canopyId],
        db
          .select({ name: canopies.name, timezone: canopies.timezone })
          .from(canopies)
          .where(eq(canopies.id, canopyId))
      )
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
        : yield* pinAccounts(
            db
              .select(accountColumns)
              .from(users)
              .where(inArray(users.id, named))
          )
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
      lockRows(
        'Invitation',
        'update',
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
      ),
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
      lockRows(
        'Room',
        strength,
        db
          .select({
            id: rooms.id,
            userId: rooms.userId,
            canopyId: rooms.canopyId,
          })
          .from(rooms)
          .where(where)
      ),
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
      Pin: ({ roomId }) => roomsWhere(held, eq(rooms.id, roomId), 'key share'),
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
      lockRows(
        'Plant',
        strength,
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
      ),
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

  return (plan: LockPlan) =>
    Effect.reduce(
      IN_LOCK_ORDER,
      () => HELD_NOTHING,
      (held, lock) => lock(plan, held)
    )
})
