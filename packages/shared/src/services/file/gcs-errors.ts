import { Array, Schema } from 'effect'

export class GCSUploadError extends Schema.Class<GCSUploadError>(
  'GCSUploadError'
)({
  message: Schema.String,
}) {}

export class GCSConfigError extends Schema.Class<GCSConfigError>(
  'GCSConfigError'
)({
  message: Schema.String,
}) {}

export class GCSDeleteError extends Schema.TaggedError<GCSDeleteError>()(
  'GCSDeleteError',
  { message: Schema.String }
) {}

export class GCSPublishError extends Schema.TaggedError<GCSPublishError>()(
  'GCSPublishError',
  { message: Schema.String }
) {}

/** A prefix delete rejects with the list of the errors it met. */
export const storageFailureMessage = (error: unknown): string => {
  if (Array.isArray(error)) {
    return Array.join(Array.map(error, storageFailureMessage), '; ')
  }
  return error instanceof Error ? error.message : 'Unknown error'
}
