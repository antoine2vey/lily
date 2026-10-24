import { Authentication } from '@lily/api/services/auth/middleware.types'
import { RateLimitExceededError } from '@lily/api/services/rate-limiter/errors'
import { UsernameAvailability } from '@lily/shared/username'
import { Schema } from 'effect'
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api'

// Query parameter for username
const usernameQuery = Schema.String

// Define the Username API group
export const UsernameApi = HttpApiGroup.make('username')
  .add(
    // GET /username/check?username=string - Check username availability
    HttpApiEndpoint.get('checkUsername', '/check', {
      query: Schema.Struct({ username: usernameQuery }),
      success: UsernameAvailability,
      error: [
        Schema.Struct({ error: Schema.String }).pipe(HttpApiSchema.status(400)),
        RateLimitExceededError,
      ],
    })
  )
  .prefix('/username')
  .middleware(Authentication)
