import { Schema } from 'effect'

export class OAuthVerificationError extends Schema.TaggedError<OAuthVerificationError>()(
  'OAuthVerificationError',
  {
    provider: Schema.Literals(['apple', 'google']),
    message: Schema.String,
  }
) {}
