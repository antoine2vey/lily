import { Authentication } from '@lily/api/services/auth/middleware.types'
import { RateLimitExceededError } from '@lily/api/services/rate-limiter/errors'
import { UsernameAvailability } from '@lily/shared/username'
import { Schema } from 'effect'
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api'

const usernameQuery = Schema.String

export const UsernameApi = HttpApiGroup.make('username')
  .add(
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
