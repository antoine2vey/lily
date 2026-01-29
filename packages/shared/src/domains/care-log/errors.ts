import { HttpApiSchema } from '@effect/platform'
import { Schema } from 'effect'

export class CareLogNotFoundError extends Schema.TaggedError<CareLogNotFoundError>()(
  'CareLogNotFoundError',
  {
    careLogId: Schema.optionalWith(Schema.String, {
      default: () => '',
    }),
  },
  HttpApiSchema.annotations({ status: 404 })
) {}
