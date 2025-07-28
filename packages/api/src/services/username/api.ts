import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from '@effect/platform'
import { DatabaseError } from '@lily/shared/errors/database'
import { UsernameAvailability } from '@lily/shared/username'
import { Schema } from 'effect'

// Query parameter for username
const usernameQuery = HttpApiSchema.param('username', Schema.String)

// Define the Username API group
export const UsernameApi = HttpApiGroup.make('username')
  .add(
    // GET /username/check?username=string - Check username availability
    HttpApiEndpoint.get('checkUsername')`/check`
      .setUrlParams(Schema.Struct({ username: usernameQuery }))
      .addSuccess(UsernameAvailability)
      .addError(DatabaseError, { status: 500 })
      .addError(Schema.Struct({ error: Schema.String }), { status: 400 })
  )
  .prefix('/username')
