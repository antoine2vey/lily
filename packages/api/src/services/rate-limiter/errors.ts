import { HttpApiSchema } from '@effect/platform'
import { Schema } from 'effect'

export class RateLimitExceededError extends Schema.TaggedError<RateLimitExceededError>()(
  'RateLimitExceededError',
  {
    message: Schema.optionalWith(Schema.String, {
      default: () => 'Rate limit exceeded. Please try again later.',
    }),
    retryAfter: Schema.optionalWith(Schema.Number, {
      default: () => 60,
    }),
  },
  HttpApiSchema.annotations({ status: 429 })
) {}
