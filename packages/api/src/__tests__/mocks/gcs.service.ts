import type { GCSUploadRequest, GCSUploadResponse } from '@lily/shared/server'
import { GCSService } from '@lily/shared/server'
import { Array, Effect, Layer } from 'effect'

export const createMockGCSService = (): Layer.Layer<GCSService> => {
  const mockService = {
    uploadFile: (request: GCSUploadRequest): Effect.Effect<GCSUploadResponse> =>
      Effect.succeed({
        key: `${Date.now()}-${request.fileName}`,
        url: `https://storage.googleapis.com/mock-bucket/${request.fileName}`,
        bucketName: 'mock-bucket',
        uploadedAt: new Date(),
      }),

    getSignedUrl: (key: string): Effect.Effect<string> =>
      Effect.succeed(
        `https://storage.googleapis.com/mock-private-bucket/${key}?signed=true&expires=3600`
      ),

    getSignedUrls: (
      keys: readonly string[]
    ): Effect.Effect<Map<string, string>> =>
      Effect.succeed(
        new Map(
          Array.map(Array.dedupe(keys), (key) => [
            key,
            `https://storage.googleapis.com/mock-private-bucket/${key}?signed=true&expires=3600`,
          ])
        )
      ),

    uploadPrivateFile: (
      request: GCSUploadRequest
    ): Effect.Effect<GCSUploadResponse> =>
      Effect.succeed({
        key: `${Date.now()}-${request.fileName}`,
        url: `https://storage.googleapis.com/mock-private-bucket/${request.fileName}?signed=true`,
        bucketName: 'mock-private-bucket',
        uploadedAt: new Date(),
      }),
  }

  return Layer.succeed(
    GCSService,
    mockService as unknown as typeof GCSService.Service
  )
}
