import { Schema } from 'effect'

export class OAuthVerificationError extends Schema.TaggedError<OAuthVerificationError>()(
  'OAuthVerificationError',
  {
    provider: Schema.Literal('apple', 'google'),
    message: Schema.String,
  }
) {}
