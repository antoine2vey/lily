import { Schema } from 'effect'

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
