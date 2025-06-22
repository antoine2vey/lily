import { Rpc, RpcGroup } from '@effect/rpc'
import { DatabaseError } from '@lily/api/services/database/error'
import { UserNotFoundError } from '@lily/api/services/user/error'
import { Schema } from 'effect'

// Define a user with an ID, name, email, and appleId
export class User extends Schema.Class<User>('User')({
  id: Schema.String, // User's ID as a string
  name: Schema.String, // User's name as a string
  email: Schema.String, // User's email as a string
  appleId: Schema.String, // Apple OAuth ID
}) {}

export class UserByIdRequest extends Schema.Class<UserByIdRequest>(
  'UserByIdRequest'
)({
  id: Schema.String,
}) {}

export class UserCreateRequest extends Schema.Class<UserCreateRequest>(
  'UserCreateRequest'
)({
  name: Schema.String,
  email: Schema.String,
  appleId: Schema.String,
}) {}

export class UserUpdateRequest extends Schema.Class<UserUpdateRequest>(
  'UserUpdateRequest'
)({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
}) {}

export class UserDeleteRequest extends Schema.Class<UserDeleteRequest>(
  'UserDeleteRequest'
)({
  id: Schema.String,
}) {}

// Define a group of RPCs for user management
export class UserRpcs extends RpcGroup.make(
  // Request to retrieve a list of users
  Rpc.make('UserList', {
    success: Schema.Array(User), // Return array of users instead of stream
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
