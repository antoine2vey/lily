import { HttpApiSchema } from '@effect/platform'
import { Schema } from 'effect'

export class IngestJobNotFoundError extends Schema.TaggedError<IngestJobNotFoundError>()(
  'IngestJobNotFoundError',
  {
    jobId: Schema.optionalWith(Schema.String, { default: () => '' }),
  },
  HttpApiSchema.annotations({ status: 404 })
) {}

export class AdapterError extends Schema.TaggedError<AdapterError>()(
  'AdapterError',
  {
    message: Schema.String,
    adapter: Schema.optionalWith(Schema.String, { default: () => '' }),
  },
  HttpApiSchema.annotations({ status: 500 })
) {}

export class EmbeddingError extends Schema.TaggedError<EmbeddingError>()(
  'EmbeddingError',
  {
    message: Schema.String,
  },
  HttpApiSchema.annotations({ status: 500 })
) {}
