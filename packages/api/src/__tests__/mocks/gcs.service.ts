import type {
  GCSUploadRequest,
  GCSUploadResponse,
} from '@lily/api/services/file/gcs'
import { GCSService } from '@lily/api/services/file/gcs'
import {
  GCSDeleteError,
  GCSPublishError,
} from '@lily/api/services/file/gcs-errors'
import {
  type InvalidImageError,
  planImageUpload,
} from '@lily/api/services/file/image-upload'
import {
  type BucketRole,
  type ListedObject,
  type ObjectScope,
  publicUrlOf,
  readStoredRef,
  type StoredObject,
  scopePrefix,
} from '@lily/api/services/file/stored-object'
import {
  mintStoredRef,
  type StoredObjectRef,
} from '@lily/shared/services/file/stored-ref-mint'
import { Array, DateTime, Effect, Layer, Stream } from 'effect'

export const MOCK_BUCKET_NAMES = {
  plant: 'mock-bucket',
  ai: 'mock-private-bucket',
}

export const mockPublicUrl = (key: string) =>
  mintStoredRef(publicUrlOf(MOCK_BUCKET_NAMES.plant, key))

const signedUrl = (key: string, query: string) =>
  `https://storage.googleapis.com/${MOCK_BUCKET_NAMES.ai}/${key}?${query}`

/**
 * GCS held in memory: uploads land in `objects`, `put` stores an object with
 * a chosen size and creation time, deletes remove them,
 * `outage.deletes` makes every delete fail the way an unreachable bucket does,
 * and `outage.defect` makes it die the way a bug in the client does.
 */
export const createInMemoryGCS = (
  options: { privateUploads?: GCSUploadRequest[]; signedKeys?: string[] } = {}
) => {
  const objects: Record<BucketRole, Set<string>> = {
    plant: new Set(),
    ai: new Set(),
  }
  const created = new Map<string, { size: number; createdAt: DateTime.Utc }>()
  const outage = { deletes: false, defect: false }

  const put = (
    bucket: BucketRole,
    key: string,
    meta: { size: number; createdAt: DateTime.Utc }
  ) => {
    objects[bucket].add(key)
    created.set(`${bucket}/${key}`, meta)
  }

  const save = (bucket: BucketRole, request: GCSUploadRequest) =>
    Effect.tap(planImageUpload(request.fileBuffer, request.folder), ({ key }) =>
      Effect.sync(() => objects[bucket].add(key))
    )

  const unlessOutage = (remove: () => void) =>
    Effect.suspend(() => {
      if (outage.defect) return Effect.die(new Error('storage client bug'))
      return outage.deletes
        ? Effect.fail(new GCSDeleteError({ message: 'bucket unreachable' }))
        : Effect.sync(remove)
    })

  const mockService = {
    uploadFile: (
      request: GCSUploadRequest
    ): Effect.Effect<GCSUploadResponse, InvalidImageError> =>
      Effect.map(save('plant', request), ({ key }) => ({
        key: mintStoredRef(key),
        url: mockPublicUrl(key),
        bucketName: MOCK_BUCKET_NAMES.plant,
        uploadedAt: new Date(),
      })),

    getSignedUrl: (key: string): Effect.Effect<string> =>
      Effect.sync(() => {
        options.signedKeys?.push(key)
        return signedUrl(key, 'signed=true&expires=3600')
      }),

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
          key: mintStoredRef(key),
          url: mintStoredRef(signedUrl(key, 'signed=true')),
          bucketName: MOCK_BUCKET_NAMES.ai,
          uploadedAt: new Date(),
        })
      ),

    bucketNames: MOCK_BUCKET_NAMES,

    readRef: readStoredRef(MOCK_BUCKET_NAMES),

    listObjects: (bucket: BucketRole): Stream.Stream<ListedObject> =>
      Stream.suspend(() =>
        Stream.fromIterable(
          Array.map([...objects[bucket]], (key) => ({
            bucket,
            key,
            ...(created.get(`${bucket}/${key}`) ?? {
              size: 0,
              createdAt: DateTime.nowUnsafe(),
            }),
          }))
        )
      ),

    publish: (
      key: string,
      folder: string
    ): Effect.Effect<{ readonly url: StoredObjectRef }, GCSPublishError> =>
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
    put,
    outage,
    layer: Layer.succeed(
      GCSService,
      mockService as unknown as typeof GCSService.Service
    ),
  }
}

export const createMockGCSService = (
  options: { privateUploads?: GCSUploadRequest[]; signedKeys?: string[] } = {}
): Layer.Layer<GCSService> => createInMemoryGCS(options).layer
