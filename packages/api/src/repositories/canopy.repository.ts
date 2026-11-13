import * as PgDrizzle from '@lily/db/effect-drizzle'
import {
  canopies,
  canopyDirectInvites,
  canopyInvites,
  canopyMembers,
  canopyPlantMutes,
  plants,
  rooms,
  users,
} from '@lily/db/schema'
import type {
  CanopyId,
  CanopyInvitationStatus,
  CanopyMemberRole,
  CanopyPendingInvitation,
  LanguageCode,
} from '@lily/shared'
import { nowAsDate } from '@lily/shared'
import {
  and,
  asc,
  eq,
  getTableColumns,
  gt,
  inArray,
  isNotNull,
  isNull,
  sql,
} from 'drizzle-orm'
import { Array, Context, Effect, Layer, Option, pipe, Record } from 'effect'
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

export type CanopyInvitationRow = typeof canopyDirectInvites.$inferSelect

export interface CanopyInvitationPreviewRow extends CanopyInvitationRow {
  readonly canopyName: string
  readonly inviterName: string | null
  readonly memberCount: number
}

export interface NewCanopyInvitation {
  readonly canopyId: string
  readonly inviteeUserId: string
  readonly invitedByUserId: string
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
  readonly findMemberIdsByCanopyIds: (
    canopyIds: ReadonlyArray<string>
  ) => Effect.Effect<Record<string, ReadonlyArray<string>>, SqlError>
  readonly findReminderRecipients: (
    canopyId: string,
    plantId: string
  ) => Effect.Effect<ReadonlyArray<string>, SqlError>
  readonly findPlantIdsOfCanopy: (
    canopyId: string
  ) => Effect.Effect<ReadonlyArray<string>, SqlError>
  readonly findWithLocation: () => Effect.Effect<
    ReadonlyArray<CanopyRow>,
    SqlError
  >
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
  readonly findInvitation: (
    id: string
  ) => Effect.Effect<CanopyInvitationRow | null, SqlError>
  readonly lockInvitation: (
    id: string
  ) => Effect.Effect<CanopyInvitationRow | null, SqlError>
  readonly findInvitationPreview: (
    id: string
  ) => Effect.Effect<CanopyInvitationPreviewRow | null, SqlError>
  readonly findInvitationByPair: (
    canopyId: string,
    inviteeUserId: string
  ) => Effect.Effect<CanopyInvitationRow | null, SqlError>
  /** Opens a fresh pending invitation, reusing the pair's row if it has one. */
  readonly upsertInvitation: (
    invitation: NewCanopyInvitation
  ) => Effect.Effect<CanopyInvitationRow, SqlError>
  /** Moves `from` to `to`, or returns null when the row is not in `from`. */
  readonly transitionInvitation: (
    id: string,
    from: CanopyInvitationStatus,
    to: Exclude<CanopyInvitationStatus, 'pending'>
  ) => Effect.Effect<CanopyInvitationRow | null, SqlError>
  readonly findPendingInvitations: (
    canopyId: string
  ) => Effect.Effect<ReadonlyArray<CanopyPendingInvitation>, SqlError>
  readonly withdrawInvitationsSentBy: (
    canopyId: string,
    userId: string
  ) => Effect.Effect<void, SqlError>
  readonly mute: (
    userId: string,
    plantId: string
  ) => Effect.Effect<void, SqlError>
  readonly unmute: (
    userId: string,
    plantId: string
  ) => Effect.Effect<void, SqlError>
  readonly isMuted: (
    userId: string,
    plantId: string
  ) => Effect.Effect<boolean, SqlError>
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
  readonly returnToSharer: (
    canopyId: string,
    sharerId: string
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

      findMemberIdsByCanopyIds: Effect.fn(
        'CanopyRepository.findMemberIdsByCanopyIds'
      )(function* (canopyIds: ReadonlyArray<string>) {
        if (Array.isReadonlyArrayEmpty(canopyIds)) return {}
        const rows = yield* db
          .select({
            canopyId: canopyMembers.canopyId,
            userId: canopyMembers.userId,
          })
          .from(canopyMembers)
          .where(inArray(canopyMembers.canopyId, [...canopyIds]))
        return pipe(
          Array.groupBy(rows, (row) => row.canopyId),
          Record.map(Array.map((row) => row.userId))
        )
      }),

      findReminderRecipients: Effect.fn(
        'CanopyRepository.findReminderRecipients'
      )(function* (canopyId: string, plantId: string) {
        const rows = yield* db
          .select({ userId: canopyMembers.userId })
          .from(canopyMembers)
          .leftJoin(
            canopyPlantMutes,
            and(
              eq(canopyPlantMutes.userId, canopyMembers.userId),
              eq(canopyPlantMutes.plantId, plantId)
            )
          )
          .where(
            and(
              eq(canopyMembers.canopyId, canopyId),
              isNull(canopyPlantMutes.userId)
            )
          )
          .orderBy(asc(canopyMembers.joinedAt), asc(canopyMembers.id))
        return Array.map(rows, (row) => row.userId)
      }),

      findPlantIdsOfCanopy: Effect.fn('CanopyRepository.findPlantIdsOfCanopy')(
        function* (canopyId: string) {
          const rows = yield* db
            .select({ id: plants.id })
            .from(plants)
            .where(eq(plants.canopyId, canopyId))
          return Array.map(rows, (row) => row.id)
        }
      ),

      findWithLocation: Effect.fn('CanopyRepository.findWithLocation')(
        function* () {
          return yield* db
            .select()
            .from(canopies)
            .where(
              and(isNotNull(canopies.latitude), isNotNull(canopies.longitude))
            )
        }
      ),

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

      findInvitation: Effect.fn('CanopyRepository.findInvitation')(function* (
        id: string
      ) {
        return first(
          yield* db
            .select()
            .from(canopyDirectInvites)
            .where(eq(canopyDirectInvites.id, id))
        )
      }),

      lockInvitation: Effect.fn('CanopyRepository.lockInvitation')(function* (
        id: string
      ) {
        return first(
          yield* db
            .select()
            .from(canopyDirectInvites)
            .where(eq(canopyDirectInvites.id, id))
            .for('update')
        )
      }),

      findInvitationPreview: Effect.fn(
        'CanopyRepository.findInvitationPreview'
      )(function* (id: string) {
        const rows = yield* db
          .select({
            ...getTableColumns(canopyDirectInvites),
            canopyName: canopies.name,
            inviterName: users.name,
            memberCount: sql<number>`(SELECT count(*)::int FROM ${canopyMembers} WHERE ${canopyMembers.canopyId} = ${canopyDirectInvites.canopyId})`,
          })
          .from(canopyDirectInvites)
          .innerJoin(canopies, eq(canopies.id, canopyDirectInvites.canopyId))
          .innerJoin(users, eq(users.id, canopyDirectInvites.invitedByUserId))
          .where(eq(canopyDirectInvites.id, id))
        return first(rows)
      }),

      findInvitationByPair: Effect.fn('CanopyRepository.findInvitationByPair')(
        function* (canopyId: string, inviteeUserId: string) {
          return first(
            yield* db
              .select()
              .from(canopyDirectInvites)
              .where(
                and(
                  eq(canopyDirectInvites.canopyId, canopyId),
                  eq(canopyDirectInvites.inviteeUserId, inviteeUserId)
                )
              )
          )
        }
      ),

      upsertInvitation: Effect.fn('CanopyRepository.upsertInvitation')(
        function* (invitation: NewCanopyInvitation) {
          const fresh = {
            invitedByUserId: invitation.invitedByUserId,
            status: 'pending' as const,
            expiresAt: invitation.expiresAt,
            resolvedAt: null,
            createdAt: nowAsDate(),
          }
          const rows = yield* db
            .insert(canopyDirectInvites)
            .values({ ...invitation, ...fresh })
            .onConflictDoUpdate({
              target: [
                canopyDirectInvites.canopyId,
                canopyDirectInvites.inviteeUserId,
              ],
              set: fresh,
            })
            .returning()
          return yield* Option.match(Array.head(rows), {
            onNone: () =>
              Effect.die(new Error('invitation upsert returned no row')),
            onSome: Effect.succeed,
          })
        }
      ),

      transitionInvitation: Effect.fn('CanopyRepository.transitionInvitation')(
        function* (
          id: string,
          from: CanopyInvitationStatus,
          to: Exclude<CanopyInvitationStatus, 'pending'>
        ) {
          return first(
            yield* db
              .update(canopyDirectInvites)
              .set({ status: to, resolvedAt: nowAsDate() })
              .where(
                and(
                  eq(canopyDirectInvites.id, id),
                  eq(canopyDirectInvites.status, from)
                )
              )
              .returning()
          )
        }
      ),

      findPendingInvitations: Effect.fn(
        'CanopyRepository.findPendingInvitations'
      )(function* (canopyId: string) {
        return yield* db
          .select({
            id: canopyDirectInvites.id,
            invitee: {
              userId: users.id,
              name: users.name,
              image: users.image,
            },
            invitedByUserId: canopyDirectInvites.invitedByUserId,
            expiresAt: canopyDirectInvites.expiresAt,
          })
          .from(canopyDirectInvites)
          .innerJoin(users, eq(users.id, canopyDirectInvites.inviteeUserId))
          .where(
            and(
              eq(canopyDirectInvites.canopyId, canopyId),
              eq(canopyDirectInvites.status, 'pending'),
              gt(canopyDirectInvites.expiresAt, nowAsDate())
            )
          )
          .orderBy(asc(canopyDirectInvites.createdAt))
      }),

      withdrawInvitationsSentBy: Effect.fn(
        'CanopyRepository.withdrawInvitationsSentBy'
      )(function* (canopyId: string, userId: string) {
        yield* db
          .update(canopyDirectInvites)
          .set({ status: 'withdrawn', resolvedAt: nowAsDate() })
          .where(
            and(
              eq(canopyDirectInvites.canopyId, canopyId),
              eq(canopyDirectInvites.invitedByUserId, userId),
              eq(canopyDirectInvites.status, 'pending')
            )
          )
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

      isMuted: Effect.fn('CanopyRepository.isMuted')(function* (
        userId: string,
        plantId: string
      ) {
        const rows = yield* db
          .select({ plantId: canopyPlantMutes.plantId })
          .from(canopyPlantMutes)
          .where(
            and(
              eq(canopyPlantMutes.userId, userId),
              eq(canopyPlantMutes.plantId, plantId)
            )
          )
        return Array.isReadonlyArrayNonEmpty(rows)
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

      returnToSharer: Effect.fn('CanopyRepository.returnToSharer')(function* (
        canopyId: string,
        sharerId: string
      ) {
        const shared = and(
          eq(plants.canopyId, canopyId),
          eq(plants.createdByUserId, sharerId)
        )
        yield* db
          .delete(canopyPlantMutes)
          .where(
            inArray(
              canopyPlantMutes.plantId,
              db.select({ id: plants.id }).from(plants).where(shared)
            )
          )
        return yield* db
          .update(plants)
          .set({
            userId: sharerId,
            canopyId: null,
            roomId: null,
            updatedAt: nowAsDate(),
          })
          .where(shared)
          .returning({
            id: plants.id,
            remindersEnabled: plants.remindersEnabled,
            diedAt: plants.diedAt,
          })
      }),
    }
  })
)
