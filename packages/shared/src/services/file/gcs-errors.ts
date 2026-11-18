import { Array, Schema } from 'effect'

export class GCSUploadError extends Schema.Class<
  GCSUploadError,
  { readonly brand: unique symbol }
>('GCSUploadError')({
  message: Schema.String,
}) {}

export class GCSConfigError extends Schema.Class<
  GCSConfigError,
  { readonly brand: unique symbol }
>('GCSConfigError')({
  message: Schema.String,
}) {}

export class GCSDeleteError extends Schema.TaggedError<
  GCSDeleteError,
  { readonly brand: unique symbol }
>()('GCSDeleteError', { message: Schema.String }) {}

export class GCSPublishError extends Schema.TaggedError<
  GCSPublishError,
  { readonly brand: unique symbol }
>()('GCSPublishError', { message: Schema.String }) {}

export class GCSListError extends Schema.TaggedError<
  GCSListError,
  { readonly brand: unique symbol }
>()('GCSListError', { message: Schema.String }) {}

/** A prefix delete rejects with the list of the errors it met. */
export const storageFailureMessage = (error: unknown): string => {
  if (Array.isArray(error)) {
    return Array.join(Array.map(error, storageFailureMessage), '; ')
  }
  return error instanceof Error ? error.message : 'Unknown error'
}
