import { HttpApiBuilder } from '@effect/platform'
import type { Api } from '@lily/api/api'
import { RoomRepositoryLive } from '@lily/api/repositories/room.repository'
import { AuthenticationLive } from '@lily/api/services/auth/middleware.impl'
import { withInfraErrorsAsDefect } from '@lily/api/services/helpers/error-handling'
import { RoomsService } from '@lily/api/services/rooms/service'
import { Effect, Layer } from 'effect'

export const RoomsApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'rooms', (handlers) =>
    Effect.gen(function* () {
      const roomsService = yield* RoomsService

      return handlers
        .handle('getRooms', () =>
          roomsService.findRooms().pipe(withInfraErrorsAsDefect)
        )
        .handle('createRoom', ({ payload }) =>
          roomsService.createRoom(payload).pipe(withInfraErrorsAsDefect)
        )
        .handle('updateRoom', ({ path: { id }, payload }) =>
          roomsService
            .updateRoom({ id, data: payload })
            .pipe(withInfraErrorsAsDefect)
        )
        .handle('deleteRoom', ({ path: { id } }) =>
          roomsService.deleteRoom({ id }).pipe(withInfraErrorsAsDefect)
        )
    })
  ).pipe(
    Layer.provide(RoomsService.Default),
    Layer.provide(RoomRepositoryLive),
    Layer.provide(AuthenticationLive)
  )
