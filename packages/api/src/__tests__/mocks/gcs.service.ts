import type { GCSUploadRequest, GCSUploadResponse } from '@lily/shared'
import { GCSService } from '@lily/shared/services/file/gcs'
import { Effect, Layer } from 'effect'

export const createMockGCSService = (): Layer.Layer<GCSService> => {
  const mockService = {
    uploadFile: (request: GCSUploadRequest): Effect.Effect<GCSUploadResponse> =>
      Effect.succeed({
        key: `${Date.now()}-${request.fileName}`,
        url: `https://storage.googleapis.com/mock-bucket/${request.fileName}`,
        bucketName: 'mock-bucket',
        uploadedAt: new Date(),
      }),

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
