import { Effect, Schema } from 'effect'

export class IngestJobNotFoundError extends Schema.TaggedError<
  IngestJobNotFoundError,
  { readonly brand: unique symbol }
>()(
  'IngestJobNotFoundError',
  {
    jobId: Schema.String.pipe(
      Schema.withDecodingDefaultType(Effect.succeed('')),
      Schema.withConstructorDefault(Effect.succeed(''))
    ),
  },
  { httpApiStatus: 404 }
) {}

export class AdapterError extends Schema.TaggedError<
  AdapterError,
  { readonly brand: unique symbol }
>()(
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

export class EmbeddingError extends Schema.TaggedError<
  EmbeddingError,
  { readonly brand: unique symbol }
>()(
  'EmbeddingError',
  {
    message: Schema.String,
  },
  { httpApiStatus: 500 }
) {}
