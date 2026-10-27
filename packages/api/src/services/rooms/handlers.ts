import type { Api } from '@lily/api/api'
import { withInfraErrorsAsDefect } from '@lily/api/services/helpers/error-handling'
import { createRoom } from '@lily/api/services/rooms/endpoints/create-room'
import { deleteRoom } from '@lily/api/services/rooms/endpoints/delete-room'
import { findRooms } from '@lily/api/services/rooms/endpoints/find-rooms'
import { updateRoom } from '@lily/api/services/rooms/endpoints/update-room'
import { HttpApiBuilder } from 'effect/http-api'

export const RoomsApiLive = (api: Api) =>
  HttpApiBuilder.group(api, 'rooms', (handlers) =>
    handlers
      .handle('getRooms', () => findRooms().pipe(withInfraErrorsAsDefect))
      .handle('createRoom', ({ payload }) =>
        createRoom(payload).pipe(withInfraErrorsAsDefect)
      )
      .handle('updateRoom', ({ params: { id }, payload }) =>
        updateRoom({ id, data: payload }).pipe(withInfraErrorsAsDefect)
      )
      .handle('deleteRoom', ({ params: { id } }) =>
        deleteRoom({ id }).pipe(withInfraErrorsAsDefect)
      )
  )
