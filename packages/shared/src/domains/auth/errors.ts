import { Schema } from 'effect'

/**
 * Failure of an auth flow step: bad or expired magic link code, refresh
 * token or OAuth token, or a rejected username. Endpoints override the
 * status per declaration (`HttpApiSchema.status(401)` on the refresh and
 * session routes).
 */
export class AuthError extends Schema.TaggedError<AuthError>()(
  'AuthError',
  {
    message: Schema.String,
  },
  { httpApiStatus: 400 }
) {}
