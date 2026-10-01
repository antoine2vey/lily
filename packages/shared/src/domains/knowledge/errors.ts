import { Effect, Schema } from 'effect'

export class IngestJobNotFoundError extends Schema.TaggedError<IngestJobNotFoundError>()(
  'IngestJobNotFoundError',
  {
    jobId: Schema.String.pipe(
      Schema.withDecodingDefaultType(Effect.succeed('')),
      Schema.withConstructorDefault(Effect.succeed(''))
    ),
  },
  { httpApiStatus: 404 }
) {}

export class AdapterError extends Schema.TaggedError<AdapterError>()(
  'AdapterError',
  {
    message: Schema.String,
    adapter: Schema.String.pipe(
      Schema.withDecodingDefaultType(Effect.succeed('')),
      Schema.withConstructorDefault(Effect.succeed(''))
    ),
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
