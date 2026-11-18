import { Effect, Schema } from 'effect'

export class RateLimitExceededError extends Schema.TaggedError<
  RateLimitExceededError,
  { readonly brand: unique symbol }
>()(
  'RateLimitExceededError',
  {
    message: Schema.String.pipe(
      Schema.withDecodingDefaultType(
        Effect.succeed('Rate limit exceeded. Please try again later.')
      ),
      Schema.withConstructorDefault(
        Effect.succeed('Rate limit exceeded. Please try again later.')
      )
    ),
    retryAfter: Schema.Finite.pipe(
      Schema.withDecodingDefaultType(Effect.succeed(60)),
      Schema.withConstructorDefault(Effect.succeed(60))
    ),
  },
  { httpApiStatus: 429 }
) {}
