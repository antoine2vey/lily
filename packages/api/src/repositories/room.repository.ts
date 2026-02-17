import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { plants, rooms } from '@lily/db'
import { nowAsDate } from '@lily/shared'
import { asc, count, eq } from 'drizzle-orm'
import { Array, Context, Effect, Layer, Option } from 'effect'

export interface CreateRoomData {
  name: string
  icon: string
  luminosity?: number | undefined
  isOutdoor?: boolean | undefined
  order: number
  userId: string
}

export interface UpdateRoomData {
  name?: string | undefined
  icon?: string | undefined
  order?: number | undefined
  luminosity?: number | null | undefined
  isOutdoor?: boolean | undefined
}

export interface IRoomRepository {
  readonly findAll: (
    userId: string
  ) => Effect.Effect<
    Array<typeof rooms.$inferSelect & { plantCount: number }>,
    SqlError
  >
  readonly findById: (
    id: string
  ) => Effect.Effect<typeof rooms.$inferSelect | null, SqlError>
  readonly create: (
    data: CreateRoomData
  ) => Effect.Effect<typeof rooms.$inferSelect | null, SqlError>
  readonly update: (
    id: string,
    data: UpdateRoomData
  ) => Effect.Effect<typeof rooms.$inferSelect | null, SqlError>
  readonly delete: (
    id: string
  ) => Effect.Effect<typeof rooms.$inferSelect | null, SqlError>
  readonly getMaxOrder: (userId: string) => Effect.Effect<number, SqlError>
}

export class RoomRepository extends Context.Tag('RoomRepository')<
  RoomRepository,
  IRoomRepository
>() {}

export const RoomRepositoryLive = Layer.effect(
  RoomRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    return {
      findAll: (userId: string) =>
        Effect.gen(function* () {
          return yield* db
            .select({
              id: rooms.id,
              name: rooms.name,
              icon: rooms.icon,
              luminosity: rooms.luminosity,
              isOutdoor: rooms.isOutdoor,
              order: rooms.order,
              userId: rooms.userId,
              createdAt: rooms.createdAt,
              updatedAt: rooms.updatedAt,
              plantCount: count(plants.id),
            })
            .from(rooms)
            .leftJoin(plants, eq(plants.roomId, rooms.id))
            .where(eq(rooms.userId, userId))
            .groupBy(rooms.id)
            .orderBy(asc(rooms.order), asc(rooms.name))
        }).pipe(Effect.withSpan('RoomRepository.findAll')),

      findById: (id: string) =>
        Effect.gen(function* () {
          const [room] = yield* db.select().from(rooms).where(eq(rooms.id, id))
          return Option.getOrNull(Option.fromNullable(room))
        }).pipe(Effect.withSpan('RoomRepository.findById')),

      create: (data: CreateRoomData) =>
        Effect.gen(function* () {
          const [room] = yield* db.insert(rooms).values(data).returning()
          return Option.getOrNull(Option.fromNullable(room))
        }).pipe(Effect.withSpan('RoomRepository.create')),

      update: (id: string, data: UpdateRoomData) =>
        Effect.gen(function* () {
          const [room] = yield* db
            .update(rooms)
            .set({ ...data, updatedAt: nowAsDate() })
            .where(eq(rooms.id, id))
            .returning()
          return Option.getOrNull(Option.fromNullable(room))
        }).pipe(Effect.withSpan('RoomRepository.update')),

      delete: (id: string) =>
        Effect.gen(function* () {
          const [room] = yield* db
            .delete(rooms)
            .where(eq(rooms.id, id))
            .returning()
          return Option.getOrNull(Option.fromNullable(room))
        }).pipe(Effect.withSpan('RoomRepository.delete')),

      getMaxOrder: (userId: string) =>
        Effect.gen(function* () {
          const rows = yield* db
            .select({ order: rooms.order })
            .from(rooms)
            .where(eq(rooms.userId, userId))
            .orderBy(asc(rooms.order))

          return Option.getOrElse(
            Option.map(Array.last(rows), (r) => r.order),
            () => 0
          )
        }).pipe(Effect.withSpan('RoomRepository.getMaxOrder')),
    }
  })
)
