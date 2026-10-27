import {
  ownerColumns,
  sameOwner,
  withOwner,
} from '@lily/api/repositories/helpers/plant-owner'
import {
  type IRoomRepository,
  RoomRepository,
} from '@lily/api/repositories/room.repository'
import type { rooms } from '@lily/db/schema'
import { Array, Effect, Layer, Option, pipe } from 'effect'

type RoomRecord = typeof rooms.$inferSelect

export const createMockRoomRepository = (
  roomsData: RoomRecord[]
): Layer.Layer<RoomRepository> => {
  const repo: IRoomRepository = {
    findAll: ({ userId }) => {
      const filtered = Array.filter(roomsData, (r) => r.userId === userId)
      const sorted = [...filtered].sort((a, b) =>
        a.order !== b.order ? a.order - b.order : a.name.localeCompare(b.name)
      )
      return Effect.succeed(
        Array.map(sorted, (room) => ({ ...withOwner(room), plantCount: 0 }))
      )
    },

    findById: (id: string) =>
      Effect.succeed(
        pipe(
          Array.findFirst(roomsData, (r) => r.id === id),
          Option.map(withOwner),
          Option.getOrNull
        )
      ),

    create: (data) => {
      const newRoom: RoomRecord = {
        id: `room-${crypto.randomUUID()}`,
        name: data.name,
        icon: data.icon,
        luminosity: data.luminosity ?? null,
        orientation: data.orientation ?? null,
        isOutdoor: data.isOutdoor ?? false,
        order: data.order,
        ...ownerColumns(data.owner),
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      return Effect.succeed(withOwner(newRoom))
    },

    update: (id, owner, data) => {
      const roomOption = Array.findFirst(
        roomsData,
        (r) => r.id === id && sameOwner(withOwner(r).owner, owner)
      )
      return Option.match(roomOption, {
        onNone: () => Effect.succeed(null),
        onSome: (room) => {
          const updated: RoomRecord = {
            ...room,
            updatedAt: new Date(),
            ...(data.name !== undefined ? { name: data.name } : {}),
            ...(data.icon !== undefined ? { icon: data.icon } : {}),
            ...(data.order !== undefined ? { order: data.order } : {}),
            ...(data.luminosity !== undefined
              ? { luminosity: data.luminosity }
              : {}),
          }
          return Effect.succeed(withOwner(updated))
        },
      })
    },

    delete: (id, owner) =>
      Effect.succeed(
        pipe(
          Array.findFirst(
            roomsData,
            (r) => r.id === id && sameOwner(withOwner(r).owner, owner)
          ),
          Option.map(withOwner),
          Option.getOrNull
        )
      ),

    getMaxOrder: (owner) => {
      const filtered = Array.filter(roomsData, (r) =>
        sameOwner(withOwner(r).owner, owner)
      )
      return Effect.succeed(
        Option.getOrElse(
          Option.map(
            Array.last([...filtered].sort((a, b) => a.order - b.order)),
            (r) => r.order
          ),
          () => 0
        )
      )
    },

    countByUserId: (userId: string) =>
      Effect.succeed(
        Array.length(Array.filter(roomsData, (r) => r.userId === userId))
      ),
  }

  return Layer.succeed(RoomRepository, repo)
}
