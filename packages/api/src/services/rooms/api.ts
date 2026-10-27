import { Authentication } from '@lily/api/services/auth/middleware.types'
import {
  Room,
  RoomCreateRequest,
  RoomListWithCountsResponse,
  RoomNotFoundError,
  RoomUpdateRequest,
} from '@lily/shared'
import { Schema } from 'effect'
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api'

const roomIdParam = Schema.String.check(Schema.isGUID())

export const RoomsApi = HttpApiGroup.make('rooms')
  .add(
    HttpApiEndpoint.get('getRooms', '/', {
      success: RoomListWithCountsResponse,
      error: Schema.Struct({ error: Schema.String }).pipe(
        HttpApiSchema.status(401)
      ),
    })
  )
  .add(
    HttpApiEndpoint.post('createRoom', '/', {
      payload: RoomCreateRequest,
      success: Room.pipe(HttpApiSchema.status(201)),
      error: Schema.Struct({ error: Schema.String }).pipe(
        HttpApiSchema.status(401)
      ),
    })
  )
  .add(
    HttpApiEndpoint.put('updateRoom', '/:id', {
      params: { id: roomIdParam },
      payload: RoomUpdateRequest,
      success: Room,
      error: [
        RoomNotFoundError,
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .add(
    HttpApiEndpoint.delete('deleteRoom', '/:id', {
      params: { id: roomIdParam },
      success: Room,
      error: [
        RoomNotFoundError,
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(401)),
      ],
    })
  )
  .prefix('/rooms')
  .middleware(Authentication)
