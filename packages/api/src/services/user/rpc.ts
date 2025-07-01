import { Rpc, RpcGroup } from '@effect/rpc'
import { DatabaseError } from '@lily/shared/errors/database'
import { UserNotFoundError } from '@lily/shared/errors/user'
import {
  User,
  UserByIdRequest,
  UserCreateRequest,
  UserDeleteRequest,
  UserUpdateRequest,
} from '@lily/shared/user'
import { Schema } from 'effect'

// Define a group of RPCs for user management
export class UserRpc extends RpcGroup.make(
  // Request to retrieve a list of users
  Rpc.make('UserList', {
    success: User,
    stream: true,
    error: DatabaseError,
  }),
  Rpc.make('UserById', {
    success: User,
    error: Schema.Union(DatabaseError, UserNotFoundError),
    payload: UserByIdRequest,
  }),
  Rpc.make('UserCreate', {
    success: User,
    error: DatabaseError,
    payload: UserCreateRequest,
  }),
  Rpc.make('UserUpdate', {
    success: User,
    error: Schema.Union(DatabaseError, UserNotFoundError),
    payload: UserUpdateRequest,
  }),
  Rpc.make('UserDelete', {
    success: User,
    error: Schema.Union(DatabaseError, UserNotFoundError),
    payload: UserDeleteRequest,
  })
) {}
