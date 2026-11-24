import {
  CanopyWrite,
  RoomMove,
} from '@lily/api/contexts/canopy/domain/vocabulary'
import { liveLinkOf } from '@lily/api/contexts/canopy/store/lock'
import {
  Transition,
  transition,
  transitionEach,
} from '@lily/api/kernel/transition'
import { expectWritten } from '@lily/api/kernel/written'
import {
  ownedBy,
  ownerColumns,
} from '@lily/api/repositories/helpers/plant-owner'
import { NotificationRepository } from '@lily/api/repositories/notification.repository'
import * as PgDrizzle from '@lily/db/effect-drizzle'
import {
  canopies,
  canopyDirectInvites,
  canopyInvites,
  canopyMembers,
  canopyPlantMutes,
  plants,
  rooms,
} from '@lily/db/schema'
import { type CanopyId, nowAsDate, type PlantOwner } from '@lily/shared'
import { and, eq, inArray, or, sql } from 'drizzle-orm'
import { Array, DateTime, Effect, Match, Option, pipe } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export const makeWrite = Effect.gen(function* () {
  const db = yield* PgDrizzle.PgDrizzle
  const notifications = yield* NotificationRepository

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
          yield* expectWritten(canopyMembers, w)(removed)
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
          expectWritten(canopyMembers, w)
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
        Effect.flatMap(
          transition(db, 'Invitation', w.id, {
            from: ['pending'],
            to: w.to,
            also: { resolvedAt: DateTime.toDateUtc(w.at) },
          }),
          Transition.$match({
            Moved: () => Effect.void,
            LostRace: () => expectWritten(canopyDirectInvites, w)([]),
          })
        ),
      WithdrawInvitationsSentByOrTo: (w) =>
        Effect.asVoid(
          transitionEach(db, 'Invitation', {
            from: ['pending'],
            to: 'withdrawn',
            also: { resolvedAt: DateTime.toDateUtc(w.at) },
            where: and(
              eq(canopyDirectInvites.canopyId, w.canopyId),
              or(
                eq(canopyDirectInvites.invitedByUserId, w.userId),
                eq(canopyDirectInvites.inviteeUserId, w.userId)
              )
            ),
          })
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
          yield* expectWritten(rooms, w, w.roomIds.length)(moved)
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
              and(inArray(plants.id, [...w.plantIds]), ownedBy(plants, w.from))
            )
            .returning({ id: plants.id })
          yield* expectWritten(plants, w, w.plantIds.length)(moved)
          yield* dropWhatTheCanopyHeld(w.from)(w.plantIds)
        }),
    })

  return write
})
