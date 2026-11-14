import * as PgDrizzle from '@lily/db/effect-drizzle'
import {
  canopies,
  canopyDirectInvites,
  canopyInvites,
  canopyMembers,
  canopyPlantMutes,
  plants,
  users,
} from '@lily/db/schema'
import type {
  CanopyId,
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

export type CanopyInvitationRow = typeof canopyDirectInvites.$inferSelect

export interface CanopyInvitationPreviewRow extends CanopyInvitationRow {
  readonly canopyName: string
  readonly inviterName: string | null
  readonly memberCount: number
}

export interface ICanopyRepository {
  readonly findMembershipByUser: (
    userId: string
  ) => Effect.Effect<CanopyMembership | null, SqlError>
  readonly findById: (
    canopyId: string
  ) => Effect.Effect<CanopyRow | null, SqlError>
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
  readonly findActiveInvite: (
    canopyId: string
  ) => Effect.Effect<{ readonly expiresAt: Date } | null, SqlError>
  readonly findInviteByTokenHash: (
    tokenHash: string
  ) => Effect.Effect<CanopyInviteRow | null, SqlError>
  readonly findInvitationPreview: (
    id: string
  ) => Effect.Effect<CanopyInvitationPreviewRow | null, SqlError>
  readonly findPendingInvitations: (
    canopyId: string
  ) => Effect.Effect<ReadonlyArray<CanopyPendingInvitation>, SqlError>
  readonly isMuted: (
    userId: string,
    plantId: string
  ) => Effect.Effect<boolean, SqlError>
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
    }
  })
)
