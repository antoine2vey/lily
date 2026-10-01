import { Schema } from 'effect'

export class IngestJobNotFoundError extends Schema.TaggedError<IngestJobNotFoundError>()(
  'IngestJobNotFoundError',
  {
    jobId: Schema.optionalWith(Schema.String, { default: () => '' }),
  },
  { httpApiStatus: 404 }
) {}

export class AdapterError extends Schema.TaggedError<AdapterError>()(
  'AdapterError',
  {
    message: Schema.String,
    adapter: Schema.optionalWith(Schema.String, { default: () => '' }),
  },
  { httpApiStatus: 500 }
) {}

export class EmbeddingError extends Schema.TaggedError<EmbeddingError>()(
  'EmbeddingError',
  {
    message: Schema.String,
  },
  { httpApiStatus: 500 }
) {}
