import { Schema } from 'effect'

export class CareLogNotFoundError extends Schema.TaggedError<CareLogNotFoundError>()(
  'CareLogNotFoundError',
  {
    careLogId: Schema.optionalWith(Schema.String, {
      default: () => '',
    }),
  },
  { httpApiStatus: 404 }
) {}
