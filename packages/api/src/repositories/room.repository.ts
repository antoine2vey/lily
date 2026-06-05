import type { SqlError } from '@effect/sql/SqlError'
import * as PgDrizzle from '@effect/sql-drizzle/Pg'
import { extractCount } from '@lily/api/repositories/helpers/pagination'
import { plants, rooms } from '@lily/db/schema'
import { nowAsDate, type Orientation } from '@lily/shared'
import { asc, count, eq } from 'drizzle-orm'
import { Array, Context, Effect, Layer, Option } from 'effect'

export interface CreateRoomData {
  name: string
  icon: string
  luminosity?: number | undefined
  orientation?: Orientation | undefined
  isOutdoor?: boolean | undefined
  order: number
  userId: string
}

export interface UpdateRoomData {
  name?: string | undefined
  icon?: string | undefined
  order?: number | undefined
  luminosity?: number | null | undefined
  orientation?: Orientation | null | undefined
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
  readonly countByUserId: (userId: string) => Effect.Effect<number, SqlError>
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
      findAll: Effect.fn('RoomRepository.findAll')(function* (userId: string) {
        return yield* db
          .select({
            id: rooms.id,
            name: rooms.name,
            icon: rooms.icon,
            luminosity: rooms.luminosity,
            orientation: rooms.orientation,
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
      }),

      findById: Effect.fn('RoomRepository.findById')(function* (id: string) {
        const [room] = yield* db.select().from(rooms).where(eq(rooms.id, id))
        return Option.getOrNull(Option.fromNullable(room))
      }),

      create: Effect.fn('RoomRepository.create')(function* (
        data: CreateRoomData
      ) {
        const [room] = yield* db.insert(rooms).values(data).returning()
        return Option.getOrNull(Option.fromNullable(room))
      }),

      update: Effect.fn('RoomRepository.update')(function* (
        id: string,
        data: UpdateRoomData
      ) {
        const [room] = yield* db
          .update(rooms)
          .set({ ...data, updatedAt: nowAsDate() })
          .where(eq(rooms.id, id))
          .returning()
        return Option.getOrNull(Option.fromNullable(room))
      }),

      delete: Effect.fn('RoomRepository.delete')(function* (id: string) {
        const [room] = yield* db
          .delete(rooms)
          .where(eq(rooms.id, id))
          .returning()
        return Option.getOrNull(Option.fromNullable(room))
      }),

      getMaxOrder: Effect.fn('RoomRepository.getMaxOrder')(function* (
        userId: string
      ) {
        const rows = yield* db
          .select({ order: rooms.order })
          .from(rooms)
          .where(eq(rooms.userId, userId))
          .orderBy(asc(rooms.order))

        return Option.getOrElse(
          Option.map(Array.last(rows), (r) => r.order),
          () => 0
        )
      }),

      countByUserId: Effect.fn('RoomRepository.countByUserId')(function* (
        userId: string
      ) {
        const result = yield* db
          .select({ value: count() })
          .from(rooms)
          .where(eq(rooms.userId, userId))
        return extractCount(result)
      }),
    }
  })
)
