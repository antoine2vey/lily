import { type Bucket, Storage } from '@google-cloud/storage'
import {
  Array,
  Config,
  Context,
  Duration,
  Effect,
  Layer,
  Option,
  pipe,
  Redacted,
  Schema,
  String,
} from 'effect'
import { nowAsDate, nowAsEpochMillis } from '../../domains/common/date'
import {
  GCSConfigError,
  GCSDeleteError,
  GCSPublishError,
  GCSUploadError,
  storageFailureMessage,
} from './gcs-errors'
import { type InvalidImageError, planImageUpload } from './image-upload'
import {
  locateStoredObject,
  type ObjectScope,
  type StoredObject,
  scopePrefix,
} from './stored-object'

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

export interface GCSUploadRequest {
  readonly fileBuffer: Buffer
  /** Key prefix such as `avatars/<userId>`; the file name is generated */
  readonly folder: string
}

// Upload Response Schema
export const GCSUploadResponseSchema = Schema.Struct({
  key: Schema.String,
  url: Schema.String,
  bucketName: Schema.String,
  uploadedAt: Schema.DateFromString,
})

export type GCSUploadResponse = Schema.Schema.Type<
  typeof GCSUploadResponseSchema
>

export class GCSService extends Context.Service<GCSService>()('GCSService', {
  make: Effect.gen(function* () {
    // Get GCS configuration from environment variables
    const config = yield* Effect.gen(function* () {
      const projectIdRedacted = yield* Config.Redacted('GCP_PROJECT_ID')
      const credentialsJsonRedacted = yield* Config.Redacted(
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
      const validatedCredentials = yield* Schema.decodeUnknownEffect(
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

      return yield* Schema.decodeUnknownEffect(GCSConfigSchema)(rawConfig).pipe(
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
      plant: storage.bucket(yield* Config.String('GCS_PLANT_BUCKET')),
      ai: storage.bucket(yield* Config.String('GCS_AI_BUCKET')),
    }

    const deleteFailed = (error: unknown) =>
      new GCSDeleteError({
        message: `Failed to delete from GCS: ${storageFailureMessage(error)}`,
      })

    const save = (bucket: Bucket, request: GCSUploadRequest) =>
      Effect.gen(function* () {
        const { key, contentType } = yield* planImageUpload(
          request.fileBuffer,
          request.folder
        )
        yield* Effect.annotateCurrentSpan('gcs.key', key)
        yield* Effect.tryPromise({
          try: () =>
            bucket.file(key).save(request.fileBuffer, {
              metadata: { contentType },
              resumable: false,
            }),
          catch: (error) =>
            new GCSUploadError({
              message: `Failed to upload file to GCS: ${error instanceof Error ? error.message : 'Unknown error'}`,
            }),
        })
        return key
      })

    return {
      uploadFile: (
        request: GCSUploadRequest
      ): Effect.Effect<GCSUploadResponse, GCSUploadError | InvalidImageError> =>
        save(buckets.plant, request).pipe(
          Effect.map((key) => ({
            key,
            url: `https://storage.googleapis.com/${buckets.plant.name}/${key}`,
            bucketName: buckets.plant.name,
            uploadedAt: nowAsDate(),
          })),
          Effect.withSpan('GCS.uploadFile')
        ),

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

          if (Array.isArrayEmpty(uniqueKeys)) return new Map<string, string>()

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
      ): Effect.Effect<GCSUploadResponse, GCSUploadError | InvalidImageError> =>
        Effect.gen(function* () {
          const key = yield* save(buckets.ai, request)
          const [url] = yield* Effect.tryPromise({
            try: () =>
              buckets.ai.file(key).getSignedUrl({
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

      locate: locateStoredObject({
        plant: buckets.plant.name,
        ai: buckets.ai.name,
      }),

      /** Copies an ai-bucket object into the plant bucket, where it is public. */
      publish: (
        key: string,
        folder: string
      ): Effect.Effect<{ readonly url: string }, GCSPublishError> => {
        const extension = pipe(
          key,
          String.lastIndexOf('.'),
          Option.match({
            onNone: () => '',
            onSome: (dot) => String.slice(dot)(key),
          })
        )
        const publicKey = `${folder}/${crypto.randomUUID()}${extension}`
        return Effect.tryPromise({
          try: () => buckets.ai.file(key).copy(buckets.plant.file(publicKey)),
          catch: (error) =>
            new GCSPublishError({
              message: `Failed to publish ${key}: ${storageFailureMessage(error)}`,
            }),
        }).pipe(
          Effect.as({
            url: `https://storage.googleapis.com/${buckets.plant.name}/${publicKey}`,
          }),
          Effect.withSpan('GCS.publish')
        )
      },

      /** Deletes everything a scope holds in both buckets. Safe to repeat. */
      deleteScope: (scope: ObjectScope): Effect.Effect<void, GCSDeleteError> =>
        Effect.forEach(
          [buckets.plant, buckets.ai],
          (bucket) =>
            Effect.tryPromise({
              try: () =>
                bucket.deleteFiles({ prefix: scopePrefix(scope), force: true }),
              catch: deleteFailed,
            }),
          { discard: true }
        ).pipe(
          Effect.withSpan('GCS.deleteScope', {
            attributes: { 'gcs.prefix': scopePrefix(scope) },
          })
        ),

      /** Deletes the given objects. One that is already gone counts as deleted. */
      deleteObjects: (
        objects: readonly StoredObject[]
      ): Effect.Effect<void, GCSDeleteError> =>
        Effect.forEach(
          objects,
          ({ bucket, key }) =>
            Effect.tryPromise({
              try: () =>
                buckets[bucket].file(key).delete({ ignoreNotFound: true }),
              catch: deleteFailed,
            }),
          { concurrency: 10, discard: true }
        ).pipe(
          Effect.withSpan('GCS.deleteObjects', {
            attributes: { 'gcs.objectCount': objects.length },
          })
        ),
    }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
