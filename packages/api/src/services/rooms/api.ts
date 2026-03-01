import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from '@effect/platform'
import { Authentication } from '@lily/api/services/auth/middleware.types'
import {
  Room,
  RoomCreateRequest,
  RoomListWithCountsResponse,
  RoomNotFoundError,
  RoomUpdateRequest,
} from '@lily/shared'
import { Schema } from 'effect'

const roomIdParam = HttpApiSchema.param('id', Schema.UUID)

export const RoomsApi = HttpApiGroup.make('rooms')
  .add(
    HttpApiEndpoint.get('getRooms')`/`
      .addSuccess(RoomListWithCountsResponse)
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    HttpApiEndpoint.post('createRoom')`/`
      .setPayload(RoomCreateRequest)
      .addSuccess(Room, { status: 201 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    HttpApiEndpoint.put('updateRoom')`/${roomIdParam}`
      .setPayload(RoomUpdateRequest)
      .addSuccess(Room)
      .addError(RoomNotFoundError, { status: 404 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .add(
    HttpApiEndpoint.del('deleteRoom')`/${roomIdParam}`
      .addSuccess(Room)
      .addError(RoomNotFoundError, { status: 404 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 401 })
  )
  .prefix('/rooms')
  .middleware(Authentication)
