import { Schema } from 'effect'

export class OAuthVerificationError extends Schema.TaggedError<
  OAuthVerificationError,
  { readonly brand: unique symbol }
>()('OAuthVerificationError', {
  provider: Schema.Literals(['apple', 'google']),
  message: Schema.String,
}) {}
