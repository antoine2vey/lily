import { Storage } from '@google-cloud/storage'
import { Config, Duration, Effect, Redacted, Schema } from 'effect'

export const GCSConfigSchema = Schema.Struct({
  projectId: Schema.String,
  keyFilename: Schema.String, // Optional if using default credentials
})

// Upload Request Schema
export const GCSUploadRequestSchema = Schema.Struct({
  fileBuffer: Schema.instanceOf(Buffer),
  fileName: Schema.String,
  contentType: Schema.String,
  key: Schema.optional(Schema.String), // Optional custom key, otherwise uses fileName
  expiry: Schema.optional(Schema.Number), // Optional expiry in milliseconds
})

export type GCSUploadRequest = Schema.Schema.Type<typeof GCSUploadRequestSchema>

// Upload Response Schema
export const GCSUploadResponseSchema = Schema.Struct({
  key: Schema.String,
  url: Schema.String,
  bucketName: Schema.String,
  uploadedAt: Schema.Date,
})

export type GCSUploadResponse = Schema.Schema.Type<
  typeof GCSUploadResponseSchema
>

// GCS Service Error Types
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

export class GCSService extends Effect.Service<GCSService>()('GCSService', {
  effect: Effect.gen(function* () {
    // Get GCS configuration from environment variables
    const config = yield* Effect.gen(function* () {
      const projectIdRedacted = yield* Config.redacted('GCP_PROJECT_ID')
      const keyFilenameRedacted = yield* Config.redacted(
        'GOOGLE_APPLICATION_CREDENTIALS'
      )

      const rawConfig = {
        projectId: Redacted.value(projectIdRedacted),
        keyFilename: Redacted.value(keyFilenameRedacted),
      }

      return yield* Schema.decodeUnknown(GCSConfigSchema)(rawConfig).pipe(
        Effect.mapError(
          (error) =>
            new GCSConfigError({
              message: `Invalid GCS configuration: ${error.message}`,
            })
        )
      )
    })

    // Initialize Google Cloud Storage client
    const storage = new Storage({
      projectId: config.projectId,
      keyFilename: config.keyFilename,
    })

    const buckets = {
      plant: storage.bucket(yield* Config.string('GCS_PLANT_BUCKET')),
      ai: storage.bucket(yield* Config.string('GCS_AI_BUCKET')),
    }

    return {
      uploadFile: (
        request: GCSUploadRequest
      ): Effect.Effect<GCSUploadResponse, GCSUploadError> =>
        Effect.gen(function* () {
          // Validate request
          const validatedRequest = yield* Schema.decodeUnknown(
            GCSUploadRequestSchema
          )(request).pipe(
            Effect.mapError(
              (error) =>
                new GCSUploadError({
                  message: `Invalid upload request: ${error.message}`,
                })
            )
          )

          // Generate key if not provided
          const key =
            validatedRequest.key ?? `${Date.now()}-${validatedRequest.fileName}`

          // Upload file to GCS
          const file = buckets.plant.file(key)

          yield* Effect.tryPromise({
            try: () =>
              file.save(validatedRequest.fileBuffer, {
                metadata: {
                  contentType: validatedRequest.contentType,
                },
                resumable: false,
              }),
            catch: (error) =>
              new GCSUploadError({
                message: `Failed to upload file to GCS: ${error instanceof Error ? error.message : 'Unknown error'}`,
              }),
          })

          // Generate public URL
          const url = `https://storage.googleapis.com/${buckets.plant.name}/${key}`

          return {
            key,
            url,
            bucketName: buckets.plant.name,
            uploadedAt: new Date(),
          }
        }),

      uploadPrivateFile: (
        request: GCSUploadRequest
      ): Effect.Effect<GCSUploadResponse, GCSUploadError> =>
        Effect.gen(function* () {
          // Validate request (same as uploadFile)
          const validatedRequest = yield* Schema.decodeUnknown(
            GCSUploadRequestSchema
          )(request).pipe(
            Effect.mapError(
              (error) =>
                new GCSUploadError({
                  message: `Invalid upload request: ${error.message}`,
                })
            )
          )

          // Generate key if not provided (same as uploadFile)
          const key =
            validatedRequest.key ?? `${Date.now()}-${validatedRequest.fileName}`

          // Upload file to GCS with private access
          const file = buckets.ai.file(key)

          yield* Effect.tryPromise({
            try: () =>
              file.save(validatedRequest.fileBuffer, {
                metadata: {
                  contentType: validatedRequest.contentType,
                },
                resumable: false,
                // Make file private by not setting public read access
              }),
            catch: (error) =>
              new GCSUploadError({
                message: `Failed to upload private file to GCS: ${error instanceof Error ? error.message : 'Unknown error'}`,
              }),
          })

          // Return response with a private URL (signed URL for access)
          const [url] = yield* Effect.tryPromise({
            try: () =>
              file.getSignedUrl({
                action: 'read',
                expires: Date.now() + Duration.toMillis(Duration.hours(1)),
              }),
            catch: (error) =>
              new GCSUploadError({
                message: `Failed to generate private URL: ${error instanceof Error ? error.message : 'Unknown error'}`,
              }),
          })

          return {
            key,
            url,
            bucketName: buckets.ai.name,
            uploadedAt: new Date(),
          }
        }),
    }
  }),
}) {}
