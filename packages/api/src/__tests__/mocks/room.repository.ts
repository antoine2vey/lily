import {
  type IRoomRepository,
  RoomRepository,
} from '@lily/api/repositories/room.repository'
import type { rooms } from '@lily/db'
import { Array, Effect, Layer, Option, pipe } from 'effect'

type RoomRecord = typeof rooms.$inferSelect

export const createMockRoomRepository = (
  roomsData: RoomRecord[]
): Layer.Layer<RoomRepository> => {
  const repo: IRoomRepository = {
    findAll: (userId: string) => {
      const filtered = Array.filter(roomsData, (r) => r.userId === userId)
      const sorted = [...filtered].sort((a, b) =>
        a.order !== b.order ? a.order - b.order : a.name.localeCompare(b.name)
      )
      return Effect.succeed(
        Array.map(sorted, (room) => ({ ...room, plantCount: 0 }))
      )
    },

    findById: (id: string) =>
      Effect.succeed(
        pipe(
          Array.findFirst(roomsData, (r) => r.id === id),
          Option.getOrNull
        )
      ),

    create: (data) => {
      const newRoom: RoomRecord = {
        id: `room-${crypto.randomUUID()}`,
        name: data.name,
        icon: data.icon,
        luminosity: data.luminosity ?? null,
        order: data.order,
        userId: data.userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      return Effect.succeed(newRoom)
    },

    update: (id, data) => {
      const roomOption = Array.findFirst(roomsData, (r) => r.id === id)
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
          return Effect.succeed(updated)
        },
      })
    },

    delete: (id) =>
      Effect.succeed(
        pipe(
          Array.findFirst(roomsData, (r) => r.id === id),
          Option.getOrNull
        )
      ),

    getMaxOrder: (userId: string) => {
      const filtered = Array.filter(roomsData, (r) => r.userId === userId)
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
  }

  return Layer.succeed(RoomRepository, repo)
}
