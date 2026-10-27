import * as PgDrizzle from '@lily/db/effect-drizzle'
import {
  canopies,
  canopyInvites,
  canopyMembers,
  canopyPlantMutes,
  plants,
  rooms,
  users,
} from '@lily/db/schema'
import type { CanopyId, CanopyMemberRole, LanguageCode } from '@lily/shared'
import { nowAsDate } from '@lily/shared'
import { and, asc, eq, gt, inArray, isNull, sql } from 'drizzle-orm'
import { Array, Context, Effect, Layer, Option, pipe } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export interface CanopyMembership {
  readonly canopyId: CanopyId
  readonly role: CanopyMemberRole
  readonly joinedAt: Date
}

export type CanopyRow = typeof canopies.$inferSelect

export interface CanopyMemberRow {
  readonly userId: string
  readonly name: string | null
  readonly image: string | null
  readonly language: LanguageCode
  readonly role: CanopyMemberRole
  readonly joinedAt: Date
}

export interface CanopyInviteRow {
  readonly canopyId: string
  readonly canopyName: string
  readonly inviterName: string | null
  readonly memberCount: number
  readonly expiresAt: Date
  readonly revokedAt: Date | null
}

export interface CreateCanopyData {
  readonly name: string
  readonly timezone: string
  readonly latitude: number | null
  readonly longitude: number | null
}

export interface UpdateCanopyData {
  readonly name?: string | undefined
  readonly timezone?: string | undefined
  readonly latitude?: number | null | undefined
  readonly longitude?: number | null | undefined
}

export interface NewCanopyInvite {
  readonly canopyId: string
  readonly tokenHash: string
  readonly createdByUserId: string
  readonly expiresAt: Date
}

export interface MovedPlant {
  readonly id: string
  readonly remindersEnabled: boolean
  readonly diedAt: Date | null
}

export interface ICanopyRepository {
  readonly findMembershipByUser: (
    userId: string
  ) => Effect.Effect<CanopyMembership | null, SqlError>
  readonly findById: (
    canopyId: string
  ) => Effect.Effect<CanopyRow | null, SqlError>
  readonly lock: (canopyId: string) => Effect.Effect<CanopyRow | null, SqlError>
  readonly create: (
    data: CreateCanopyData
  ) => Effect.Effect<CanopyRow, SqlError>
  readonly update: (
    canopyId: string,
    data: UpdateCanopyData
  ) => Effect.Effect<CanopyRow | null, SqlError>
  readonly delete: (canopyId: string) => Effect.Effect<void, SqlError>
  readonly findMembersByJoinDate: (
    canopyId: string
  ) => Effect.Effect<ReadonlyArray<CanopyMemberRow>, SqlError>
  readonly addMember: (
    canopyId: string,
    userId: string,
    role: CanopyMemberRole
  ) => Effect.Effect<boolean, SqlError>
  readonly removeMember: (
    canopyId: string,
    userId: string
  ) => Effect.Effect<boolean, SqlError>
  readonly setRole: (
    canopyId: string,
    userId: string,
    role: CanopyMemberRole
  ) => Effect.Effect<void, SqlError>
  readonly findActiveInvite: (
    canopyId: string
  ) => Effect.Effect<{ readonly expiresAt: Date } | null, SqlError>
  readonly replaceInvite: (
    invite: NewCanopyInvite
  ) => Effect.Effect<void, SqlError>
  readonly revokeInvite: (canopyId: string) => Effect.Effect<void, SqlError>
  readonly revokeInviteCreatedBy: (
    canopyId: string,
    userId: string
  ) => Effect.Effect<void, SqlError>
  readonly findInviteByTokenHash: (
    tokenHash: string
  ) => Effect.Effect<CanopyInviteRow | null, SqlError>
  readonly mute: (
    userId: string,
    plantId: string
  ) => Effect.Effect<void, SqlError>
  readonly unmute: (
    userId: string,
    plantId: string
  ) => Effect.Effect<void, SqlError>
  readonly deleteMutesForPlant: (
    plantId: string
  ) => Effect.Effect<void, SqlError>
  readonly deleteMemberMutes: (
    canopyId: string,
    userId: string
  ) => Effect.Effect<void, SqlError>
  readonly transferToUser: (
    canopyId: string,
    userId: string
  ) => Effect.Effect<ReadonlyArray<MovedPlant>, SqlError>
}

export class CanopyRepository extends Context.Service<
  CanopyRepository,
  ICanopyRepository
>()('CanopyRepository') {}

const first = <A>(rows: ReadonlyArray<A>): A | null =>
  Option.getOrNull(Array.head(rows))

export const CanopyRepositoryLive = Layer.effect(
  CanopyRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    const canopyPlantIds = (canopyId: string) =>
      db
        .select({ id: plants.id })
        .from(plants)
        .where(eq(plants.canopyId, canopyId))

    return {
      findMembershipByUser: Effect.fn('CanopyRepository.findMembershipByUser')(
        function* (userId: string) {
          const rows = yield* db
            .select({
              canopyId: canopyMembers.canopyId,
              role: canopyMembers.role,
              joinedAt: canopyMembers.joinedAt,
            })
            .from(canopyMembers)
            .where(eq(canopyMembers.userId, userId))
            .limit(1)
          return Option.getOrNull(
            Option.map(
              Array.head(rows),
              (m): CanopyMembership => ({
                ...m,
                canopyId: m.canopyId as CanopyId,
              })
            )
          )
        }
      ),

      findById: Effect.fn('CanopyRepository.findById')(function* (
        canopyId: string
      ) {
        const rows = yield* db
          .select()
          .from(canopies)
          .where(eq(canopies.id, canopyId))
        return first(rows)
      }),

      lock: Effect.fn('CanopyRepository.lock')(function* (canopyId: string) {
        const rows = yield* db
          .select()
          .from(canopies)
          .where(eq(canopies.id, canopyId))
          .for('update')
        return first(rows)
      }),

      create: Effect.fn('CanopyRepository.create')(function* (
        data: CreateCanopyData
      ) {
        const rows = yield* db.insert(canopies).values(data).returning()
        return yield* Option.match(Array.head(rows), {
          onNone: () => Effect.die(new Error('canopy insert returned no row')),
          onSome: Effect.succeed,
        })
      }),

      update: Effect.fn('CanopyRepository.update')(function* (
        canopyId: string,
        data: UpdateCanopyData
      ) {
        const rows = yield* db
          .update(canopies)
          .set({ ...data, updatedAt: nowAsDate() })
          .where(eq(canopies.id, canopyId))
          .returning()
        return first(rows)
      }),

      delete: Effect.fn('CanopyRepository.delete')(function* (
        canopyId: string
      ) {
        yield* db.delete(canopies).where(eq(canopies.id, canopyId))
      }),

      findMembersByJoinDate: Effect.fn(
        'CanopyRepository.findMembersByJoinDate'
      )(function* (canopyId: string) {
        return yield* db
          .select({
            userId: canopyMembers.userId,
            name: users.name,
            image: users.image,
            language: users.language,
            role: canopyMembers.role,
            joinedAt: canopyMembers.joinedAt,
          })
          .from(canopyMembers)
          .innerJoin(users, eq(users.id, canopyMembers.userId))
          .where(eq(canopyMembers.canopyId, canopyId))
          .orderBy(asc(canopyMembers.joinedAt), asc(canopyMembers.id))
      }),

      addMember: Effect.fn('CanopyRepository.addMember')(function* (
        canopyId: string,
        userId: string,
        role: CanopyMemberRole
      ) {
        const rows = yield* db
          .insert(canopyMembers)
          .values({ canopyId, userId, role })
          .onConflictDoNothing({ target: canopyMembers.userId })
          .returning({ id: canopyMembers.id })
        return Array.isArrayNonEmpty(rows)
      }),

      removeMember: Effect.fn('CanopyRepository.removeMember')(function* (
        canopyId: string,
        userId: string
      ) {
        const rows = yield* db
          .delete(canopyMembers)
          .where(
            and(
              eq(canopyMembers.canopyId, canopyId),
              eq(canopyMembers.userId, userId)
            )
          )
          .returning({ id: canopyMembers.id })
        return Array.isArrayNonEmpty(rows)
      }),

      setRole: Effect.fn('CanopyRepository.setRole')(function* (
        canopyId: string,
        userId: string,
        role: CanopyMemberRole
      ) {
        yield* db
          .update(canopyMembers)
          .set({ role })
          .where(
            and(
              eq(canopyMembers.canopyId, canopyId),
              eq(canopyMembers.userId, userId)
            )
          )
      }),

      findActiveInvite: Effect.fn('CanopyRepository.findActiveInvite')(
        function* (canopyId: string) {
          const rows = yield* db
            .select({ expiresAt: canopyInvites.expiresAt })
            .from(canopyInvites)
            .where(
              and(
                eq(canopyInvites.canopyId, canopyId),
                isNull(canopyInvites.revokedAt),
                gt(canopyInvites.expiresAt, nowAsDate())
              )
            )
          return first(rows)
        }
      ),

      replaceInvite: Effect.fn('CanopyRepository.replaceInvite')(function* (
        invite: NewCanopyInvite
      ) {
        yield* db
          .update(canopyInvites)
          .set({ revokedAt: nowAsDate() })
          .where(
            and(
              eq(canopyInvites.canopyId, invite.canopyId),
              isNull(canopyInvites.revokedAt)
            )
          )
        yield* db.insert(canopyInvites).values(invite)
      }),

      revokeInvite: Effect.fn('CanopyRepository.revokeInvite')(function* (
        canopyId: string
      ) {
        yield* db
          .update(canopyInvites)
          .set({ revokedAt: nowAsDate() })
          .where(
            and(
              eq(canopyInvites.canopyId, canopyId),
              isNull(canopyInvites.revokedAt)
            )
          )
      }),

      revokeInviteCreatedBy: Effect.fn(
        'CanopyRepository.revokeInviteCreatedBy'
      )(function* (canopyId: string, userId: string) {
        yield* db
          .update(canopyInvites)
          .set({ revokedAt: nowAsDate() })
          .where(
            and(
              eq(canopyInvites.canopyId, canopyId),
              eq(canopyInvites.createdByUserId, userId),
              isNull(canopyInvites.revokedAt)
            )
          )
      }),

      findInviteByTokenHash: Effect.fn(
        'CanopyRepository.findInviteByTokenHash'
      )(function* (tokenHash: string) {
        const rows = yield* db
          .select({
            canopyId: canopyInvites.canopyId,
            canopyName: canopies.name,
            inviterName: users.name,
            memberCount: sql<number>`(SELECT count(*)::int FROM ${canopyMembers} WHERE ${canopyMembers.canopyId} = ${canopyInvites.canopyId})`,
            expiresAt: canopyInvites.expiresAt,
            revokedAt: canopyInvites.revokedAt,
          })
          .from(canopyInvites)
          .innerJoin(canopies, eq(canopies.id, canopyInvites.canopyId))
          .leftJoin(users, eq(users.id, canopyInvites.createdByUserId))
          .where(eq(canopyInvites.tokenHash, tokenHash))
        return first(rows)
      }),

      mute: Effect.fn('CanopyRepository.mute')(function* (
        userId: string,
        plantId: string
      ) {
        yield* db
          .insert(canopyPlantMutes)
          .values({ userId, plantId })
          .onConflictDoNothing()
      }),

      unmute: Effect.fn('CanopyRepository.unmute')(function* (
        userId: string,
        plantId: string
      ) {
        yield* db
          .delete(canopyPlantMutes)
          .where(
            and(
              eq(canopyPlantMutes.userId, userId),
              eq(canopyPlantMutes.plantId, plantId)
            )
          )
      }),

      deleteMutesForPlant: Effect.fn('CanopyRepository.deleteMutesForPlant')(
        function* (plantId: string) {
          yield* db
            .delete(canopyPlantMutes)
            .where(eq(canopyPlantMutes.plantId, plantId))
        }
      ),

      deleteMemberMutes: Effect.fn('CanopyRepository.deleteMemberMutes')(
        function* (canopyId: string, userId: string) {
          yield* db
            .delete(canopyPlantMutes)
            .where(
              and(
                eq(canopyPlantMutes.userId, userId),
                inArray(canopyPlantMutes.plantId, canopyPlantIds(canopyId))
              )
            )
        }
      ),

      transferToUser: Effect.fn('CanopyRepository.transferToUser')(function* (
        canopyId: string,
        userId: string
      ) {
        yield* db
          .delete(canopyPlantMutes)
          .where(inArray(canopyPlantMutes.plantId, canopyPlantIds(canopyId)))

        const [ownRooms] = yield* db
          .select({ last: sql<number>`coalesce(max(${rooms.order}), 0)` })
          .from(rooms)
          .where(eq(rooms.userId, userId))
        const offset = pipe(
          Option.fromNullishOr(ownRooms),
          Option.map((r) => Number(r.last) + 1),
          Option.getOrElse(() => 1)
        )
        yield* db
          .update(rooms)
          .set({
            userId,
            canopyId: null,
            order: sql`${rooms.order} + ${offset}`,
            updatedAt: nowAsDate(),
          })
          .where(eq(rooms.canopyId, canopyId))

        return yield* db
          .update(plants)
          .set({ userId, canopyId: null, updatedAt: nowAsDate() })
          .where(eq(plants.canopyId, canopyId))
          .returning({
            id: plants.id,
            remindersEnabled: plants.remindersEnabled,
            diedAt: plants.diedAt,
          })
      }),
    }
  })
)
