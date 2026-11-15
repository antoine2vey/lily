import type { GCSUploadRequest, GCSUploadResponse } from '@lily/shared/server'
import { GCSService } from '@lily/shared/server'
import {
  GCSDeleteError,
  GCSPublishError,
} from '@lily/shared/services/file/gcs-errors'
import {
  type InvalidImageError,
  planImageUpload,
} from '@lily/shared/services/file/image-upload'
import {
  type BucketRole,
  locateStoredObject,
  type ObjectScope,
  type StoredObject,
  scopePrefix,
} from '@lily/shared/services/file/stored-object'
import { Array, Effect, Layer } from 'effect'

export const MOCK_BUCKET_NAMES = {
  plant: 'mock-bucket',
  ai: 'mock-private-bucket',
}

export const mockPublicUrl = (key: string) =>
  `https://storage.googleapis.com/${MOCK_BUCKET_NAMES.plant}/${key}`

const signedUrl = (key: string, query: string) =>
  `https://storage.googleapis.com/${MOCK_BUCKET_NAMES.ai}/${key}?${query}`

/**
 * GCS held in memory: uploads land in `objects`, deletes remove them, and
 * `outage.deletes` makes every delete fail the way an unreachable bucket does.
 */
export const createInMemoryGCS = (
  options: { privateUploads?: GCSUploadRequest[] } = {}
) => {
  const objects: Record<BucketRole, Set<string>> = {
    plant: new Set(),
    ai: new Set(),
  }
  const outage = { deletes: false }

  const save = (bucket: BucketRole, request: GCSUploadRequest) =>
    Effect.tap(planImageUpload(request.fileBuffer, request.folder), ({ key }) =>
      Effect.sync(() => objects[bucket].add(key))
    )

  const unlessOutage = (remove: () => void) =>
    Effect.suspend(() =>
      outage.deletes
        ? Effect.fail(new GCSDeleteError({ message: 'bucket unreachable' }))
        : Effect.sync(remove)
    )

  const mockService = {
    uploadFile: (
      request: GCSUploadRequest
    ): Effect.Effect<GCSUploadResponse, InvalidImageError> =>
      Effect.map(save('plant', request), ({ key }) => ({
        key,
        url: mockPublicUrl(key),
        bucketName: MOCK_BUCKET_NAMES.plant,
        uploadedAt: new Date(),
      })),

    getSignedUrl: (key: string): Effect.Effect<string> =>
      Effect.succeed(signedUrl(key, 'signed=true&expires=3600')),

    getSignedUrls: (
      keys: readonly string[]
    ): Effect.Effect<Map<string, string>> =>
      Effect.succeed(
        new Map(
          Array.map(Array.dedupe(keys), (key) => [
            key,
            signedUrl(key, 'signed=true&expires=3600'),
          ])
        )
      ),

    uploadPrivateFile: (
      request: GCSUploadRequest
    ): Effect.Effect<GCSUploadResponse, InvalidImageError> =>
      Effect.map(
        Effect.tap(save('ai', request), () =>
          Effect.sync(() => options.privateUploads?.push(request))
        ),
        ({ key }) => ({
          key,
          url: signedUrl(key, 'signed=true'),
          bucketName: MOCK_BUCKET_NAMES.ai,
          uploadedAt: new Date(),
        })
      ),

    locate: locateStoredObject(MOCK_BUCKET_NAMES),

    publish: (
      key: string,
      folder: string
    ): Effect.Effect<{ readonly url: string }, GCSPublishError> =>
      Effect.suspend(() => {
        if (!objects.ai.has(key)) {
          return Effect.fail(
            new GCSPublishError({ message: `No such object: ${key}` })
          )
        }
        const publicKey = `${folder}/${crypto.randomUUID()}${key.slice(key.lastIndexOf('.'))}`
        objects.plant.add(publicKey)
        return Effect.succeed({ url: mockPublicUrl(publicKey) })
      }),

    deleteScope: (scope: ObjectScope): Effect.Effect<void, GCSDeleteError> =>
      unlessOutage(() => {
        for (const bucket of [objects.plant, objects.ai]) {
          for (const key of [...bucket]) {
            if (key.startsWith(scopePrefix(scope))) bucket.delete(key)
          }
        }
      }),

    deleteObjects: (
      stored: readonly StoredObject[]
    ): Effect.Effect<void, GCSDeleteError> =>
      unlessOutage(() => {
        for (const { bucket, key } of stored) objects[bucket].delete(key)
      }),
  }

  return {
    objects,
    outage,
    layer: Layer.succeed(
      GCSService,
      mockService as unknown as typeof GCSService.Service
    ),
  }
}

export const createMockGCSService = (
  options: { privateUploads?: GCSUploadRequest[] } = {}
): Layer.Layer<GCSService> => createInMemoryGCS(options).layer
