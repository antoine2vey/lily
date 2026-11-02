import { isLivingPlant } from '@lily/api/repositories/helpers/living-plant'
import { extractCount } from '@lily/api/repositories/helpers/pagination'
import {
  ownedBy,
  ownerColumns,
  type WithOwner,
  withOwner,
  withOwnerOrNull,
} from '@lily/api/repositories/helpers/plant-owner'
import * as PgDrizzle from '@lily/db/effect-drizzle'
import { canopyMembers, plants, rooms } from '@lily/db/schema'
import { nowAsDate, type Orientation, type PlantOwner } from '@lily/shared'
import { and, asc, count, eq, inArray, or } from 'drizzle-orm'
import { Array, Context, Effect, Layer, Option } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'

export interface CreateRoomData {
  name: string
  icon: string
  luminosity?: number | undefined
  orientation?: Orientation | undefined
  isOutdoor?: boolean | undefined
  order: number
  owner: PlantOwner
}

export interface UpdateRoomData {
  name?: string | undefined
  icon?: string | undefined
  order?: number | undefined
  luminosity?: number | null | undefined
  orientation?: Orientation | null | undefined
  isOutdoor?: boolean | undefined
}

export type RoomRow = WithOwner<typeof rooms.$inferSelect>

export interface FindRoomsParams {
  userId: string
  includeCanopy?: boolean
}

export interface IRoomRepository {
  readonly findAll: (
    params: FindRoomsParams
  ) => Effect.Effect<Array<RoomRow & { plantCount: number }>, SqlError>
  readonly findById: (id: string) => Effect.Effect<RoomRow | null, SqlError>
  readonly create: (
    data: CreateRoomData
  ) => Effect.Effect<RoomRow | null, SqlError>
  readonly update: (
    id: string,
    owner: PlantOwner,
    data: UpdateRoomData
  ) => Effect.Effect<RoomRow | null, SqlError>
  readonly delete: (
    id: string,
    owner: PlantOwner
  ) => Effect.Effect<RoomRow | null, SqlError>
  readonly getMaxOrder: (owner: PlantOwner) => Effect.Effect<number, SqlError>
  readonly countByUserId: (userId: string) => Effect.Effect<number, SqlError>
}

export class RoomRepository extends Context.Service<
  RoomRepository,
  IRoomRepository
>()('RoomRepository') {}

export const RoomRepositoryLive = Layer.effect(
  RoomRepository,
  Effect.gen(function* () {
    const db = yield* PgDrizzle.PgDrizzle

    return {
      findAll: Effect.fn('RoomRepository.findAll')(function* ({
        userId,
        includeCanopy,
      }: FindRoomsParams) {
        const memberOf = db
          .select({ canopyId: canopyMembers.canopyId })
          .from(canopyMembers)
          .where(eq(canopyMembers.userId, userId))
        const owned = eq(rooms.userId, userId)
        const rows = yield* db
          .select({
            id: rooms.id,
            name: rooms.name,
            icon: rooms.icon,
            luminosity: rooms.luminosity,
            orientation: rooms.orientation,
            isOutdoor: rooms.isOutdoor,
            order: rooms.order,
            userId: rooms.userId,
            canopyId: rooms.canopyId,
            createdAt: rooms.createdAt,
            updatedAt: rooms.updatedAt,
            plantCount: count(plants.id),
          })
          .from(rooms)
          // Living-only lives in the join, not the WHERE: a room whose only
          // plants are in the cemetery must still be listed (with count 0).
          .leftJoin(plants, and(eq(plants.roomId, rooms.id), isLivingPlant()))
          .where(
            includeCanopy ? or(owned, inArray(rooms.canopyId, memberOf)) : owned
          )
          .groupBy(rooms.id)
          .orderBy(asc(rooms.order), asc(rooms.name))
        return Array.map(rows, withOwner)
      }),

      findById: Effect.fn('RoomRepository.findById')(function* (id: string) {
        const [room] = yield* db.select().from(rooms).where(eq(rooms.id, id))
        return withOwnerOrNull(room)
      }),

      create: Effect.fn('RoomRepository.create')(function* (
        data: CreateRoomData
      ) {
        const { owner, ...fields } = data
        const [room] = yield* db
          .insert(rooms)
          .values({ ...fields, ...ownerColumns(owner) })
          .returning()
        return withOwnerOrNull(room)
      }),

      update: Effect.fn('RoomRepository.update')(function* (
        id: string,
        owner: PlantOwner,
        data: UpdateRoomData
      ) {
        const [room] = yield* db
          .update(rooms)
          .set({ ...data, updatedAt: nowAsDate() })
          .where(and(eq(rooms.id, id), ownedBy(rooms, owner)))
          .returning()
        return withOwnerOrNull(room)
      }),

      delete: Effect.fn('RoomRepository.delete')(function* (
        id: string,
        owner: PlantOwner
      ) {
        const [room] = yield* db
          .delete(rooms)
          .where(and(eq(rooms.id, id), ownedBy(rooms, owner)))
          .returning()
        return withOwnerOrNull(room)
      }),

      getMaxOrder: Effect.fn('RoomRepository.getMaxOrder')(function* (
        owner: PlantOwner
      ) {
        const rows = yield* db
          .select({ order: rooms.order })
          .from(rooms)
          .where(ownedBy(rooms, owner))
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
