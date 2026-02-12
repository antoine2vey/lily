import { HttpApiSchema } from '@effect/platform'
import { Schema } from 'effect'

export class DiagnosisNotFoundError extends Schema.TaggedError<DiagnosisNotFoundError>()(
  'DiagnosisNotFoundError',
  {
    diagnosisId: Schema.optionalWith(Schema.String, {
      default: () => '',
    }),
  },
  HttpApiSchema.annotations({ status: 404 })
) {}
