import { createRoom } from '@lily/api/services/rooms/endpoints/create-room'
import { deleteRoom } from '@lily/api/services/rooms/endpoints/delete-room'
import { findRooms } from '@lily/api/services/rooms/endpoints/find-rooms'
import { updateRoom } from '@lily/api/services/rooms/endpoints/update-room'
import { Effect } from 'effect'

export class RoomsService extends Effect.Service<RoomsService>()(
  'RoomsService',
  {
    effect: Effect.succeed({
      findRooms,
      createRoom,
      updateRoom,
      deleteRoom,
    }),
  }
) {}
