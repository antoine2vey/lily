import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from '@effect/platform'
import { DatabaseError } from '@lily/shared/errors/database'
import { UserNotFoundError } from '@lily/shared/errors/user'
import { User, UserCreateRequest, UserUpdateRequest } from '@lily/shared/user'
import { Schema } from 'effect'

// Path parameter for user ID
const userIdParam = HttpApiSchema.param('id', Schema.String)

// Define the Users API group
export const UsersApi = HttpApiGroup.make('users')
  .add(
    // GET /users - List all users
    HttpApiEndpoint.get('getUsers')`/`
      .addSuccess(Schema.Array(User))
      .addError(DatabaseError, { status: 500 })
  )
  .add(
    // GET /users/:id - Get user by ID
    HttpApiEndpoint.get('getUser')`/${userIdParam}`
      .addSuccess(User)
      .addError(DatabaseError, { status: 500 })
      .addError(UserNotFoundError, { status: 404 })
  )
  .add(
    // POST /users - Create user
    HttpApiEndpoint.post('createUser')`/`
      .setPayload(UserCreateRequest)
      .addSuccess(User, { status: 201 })
      .addError(DatabaseError, { status: 500 })
  )
  .add(
    // PUT /users/:id - Update user
    HttpApiEndpoint.put('updateUser')`/${userIdParam}`
      .setPayload(UserUpdateRequest)
      .addSuccess(User)
      .addError(DatabaseError, { status: 500 })
      .addError(UserNotFoundError, { status: 404 })
  )
  .add(
    // DELETE /users/:id - Delete user
    HttpApiEndpoint.del('deleteUser')`/${userIdParam}`
      .addSuccess(User)
      .addError(DatabaseError, { status: 500 })
      .addError(UserNotFoundError, { status: 404 })
  )
  .prefix('/users')
