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
