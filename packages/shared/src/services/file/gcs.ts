import { Storage } from '@google-cloud/storage'
import {
  Array,
  Config,
  Duration,
  Effect,
  Option,
  pipe,
  Redacted,
  Schema,
} from 'effect'
import { nowAsDate, nowAsEpochMillis } from '../../domains/common/date'

export const GCSCredentialsSchema = Schema.Struct({
  type: Schema.String,
  project_id: Schema.String,
  private_key_id: Schema.String,
  private_key: Schema.String,
  client_email: Schema.String,
  client_id: Schema.String,
  auth_uri: Schema.String,
  token_uri: Schema.String,
  auth_provider_x509_cert_url: Schema.String,
  client_x509_cert_url: Schema.String,
  universe_domain: Schema.optional(Schema.String),
})

export type GCSCredentials = Schema.Schema.Type<typeof GCSCredentialsSchema>

export const GCSConfigSchema = Schema.Struct({
  projectId: Schema.String,
  credentials: GCSCredentialsSchema,
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
      const credentialsJsonRedacted = yield* Config.redacted(
        'GCS_CREDENTIALS_JSON'
      )

      const credentialsJson = Redacted.value(credentialsJsonRedacted)

      // Parse the credentials JSON
      const credentials = yield* Effect.try({
        try: () => JSON.parse(credentialsJson) as unknown,
        catch: (error) =>
          new GCSConfigError({
            message: `Failed to parse GCS_CREDENTIALS_JSON: ${error instanceof Error ? error.message : 'Unknown error'}`,
          }),
      })

      // Validate credentials against schema
      const validatedCredentials = yield* Schema.decodeUnknown(
        GCSCredentialsSchema
      )(credentials).pipe(
        Effect.mapError(
          (error) =>
            new GCSConfigError({
              message: `Invalid GCS credentials: ${error.message}`,
            })
        )
      )

      const rawConfig = {
        projectId: Redacted.value(projectIdRedacted),
        credentials: validatedCredentials,
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

    // Initialize Google Cloud Storage client with credentials object
    // Cast to required type - we've validated the structure matches service account JSON
    const storage = new Storage({
      projectId: config.projectId,
      credentials: {
        client_email: config.credentials.client_email,
        private_key: config.credentials.private_key,
      },
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
          yield* Effect.annotateCurrentSpan('gcs.fileName', request.fileName)
          yield* Effect.annotateCurrentSpan(
            'gcs.contentType',
            request.contentType
          )
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
          const key = pipe(
            Option.fromNullable(validatedRequest.key),
            Option.getOrElse(
              () => `${nowAsEpochMillis()}-${validatedRequest.fileName}`
            )
          )

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
            uploadedAt: nowAsDate(),
          }
        }).pipe(Effect.withSpan('GCS.uploadFile')),

      getSignedUrl: (
        key: string,
        expiryHours = 1
      ): Effect.Effect<string, GCSUploadError> =>
        Effect.gen(function* () {
          const file = buckets.ai.file(key)

          const [url] = yield* Effect.tryPromise({
            try: () =>
              file.getSignedUrl({
                action: 'read',
                expires:
                  nowAsEpochMillis() +
                  Duration.toMillis(Duration.hours(expiryHours)),
              }),
            catch: (error) =>
              new GCSUploadError({
                message: `Failed to generate signed URL: ${error instanceof Error ? error.message : 'Unknown error'}`,
              }),
          })

          return url
        }).pipe(Effect.withSpan('GCS.getSignedUrl')),

      getSignedUrls: (
        keys: readonly string[],
        expiryHours = 1
      ): Effect.Effect<Map<string, string>, GCSUploadError> =>
        Effect.gen(function* () {
          const uniqueKeys = Array.dedupe(keys)

          if (Array.isEmptyArray(uniqueKeys)) return new Map<string, string>()

          const expiry =
            nowAsEpochMillis() + Duration.toMillis(Duration.hours(expiryHours))

          const pairs = yield* Effect.forEach(
            uniqueKeys,
            (key) =>
              Effect.tryPromise({
                try: () =>
                  buckets.ai
                    .file(key)
                    .getSignedUrl({ action: 'read', expires: expiry }),
                catch: (error) =>
                  new GCSUploadError({
                    message: `Failed to generate signed URL: ${error instanceof Error ? error.message : 'Unknown error'}`,
                  }),
              }).pipe(Effect.map(([url]) => [key, url] as const)),
            { concurrency: 'unbounded' }
          )

          return new Map(pairs)
        }).pipe(
          Effect.withSpan('GCS.getSignedUrls', {
            attributes: { 'gcs.keyCount': keys.length },
          })
        ),

      uploadPrivateFile: (
        request: GCSUploadRequest
      ): Effect.Effect<GCSUploadResponse, GCSUploadError> =>
        Effect.gen(function* () {
          yield* Effect.annotateCurrentSpan('gcs.fileName', request.fileName)
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
          const key = pipe(
            Option.fromNullable(validatedRequest.key),
            Option.getOrElse(
              () => `${nowAsEpochMillis()}-${validatedRequest.fileName}`
            )
          )

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
                expires:
                  nowAsEpochMillis() + Duration.toMillis(Duration.hours(1)),
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
            uploadedAt: nowAsDate(),
          }
        }).pipe(Effect.withSpan('GCS.uploadPrivateFile')),
    }
  }),
}) {}
