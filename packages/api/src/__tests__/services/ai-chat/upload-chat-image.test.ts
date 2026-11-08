import { failureOf } from '@lily/api/__tests__/fixtures/exit'
import { HTML_BYTES } from '@lily/api/__tests__/fixtures/images'
import { createMockFileSystem } from '@lily/api/__tests__/mocks/file-system'
import { createMockGCSService } from '@lily/api/__tests__/mocks/gcs.service'
import { createMockRateLimiterService } from '@lily/api/__tests__/mocks/rate-limiter.service'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { uploadChatImage } from '@lily/api/services/ai-chat/endpoints/upload-chat-image'
import { RateLimitExceededError } from '@lily/api/services/rate-limiter/errors'
import type { GCSUploadRequest } from '@lily/shared/server'
import { InvalidImageError } from '@lily/shared/services/file/image-upload'
import { Array, Effect, Exit, Layer } from 'effect'
import type { PersistedFile } from 'effect/http/Multipart'
import { describe, expect, it } from 'vitest'

const mockFile = {
  _tag: 'PersistedFile' as const,
  key: 'file',
  name: 'photo.jpg',
  contentType: 'image/jpeg',
  path: '/tmp/upload-12345/photo.jpg',
} as unknown as PersistedFile

describe('uploadChatImage', () => {
  // Auth (plant ownership / conversation ownership) is enforced by the
  // handler layer; this endpoint just trusts conversationId and uploads.
  const createTestLayer = () =>
    Layer.mergeAll(
      createMockCurrentUser({ id: 'user-1' }),
      createMockGCSService(),
      createMockFileSystem(),
      createMockRateLimiterService()
    )

  it('should upload an image and return a signed URL', async () => {
    const result = await Effect.runPromise(
      uploadChatImage({
        conversationId: 'conv-1',
        files: [mockFile],
      }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.imageUrl).toBeDefined()
    expect(result.imageUrl).toContain('signed=true')
    expect(result.imageKey).toBeDefined()
  })

  it('should fail when files array is empty', async () => {
    await expect(
      Effect.runPromise(
        uploadChatImage({
          conversationId: 'conv-1',
          files: [],
        }).pipe(Effect.provide(createTestLayer()))
      )
    ).rejects.toBeDefined()
  })

  it('builds the key without the client file name', async () => {
    const maliciousFile = {
      _tag: 'PersistedFile' as const,
      key: 'file',
      name: '../../etc/passwd',
      contentType: 'image/jpeg',
      path: '/tmp/upload-99999/passwd',
    } as unknown as PersistedFile

    const result = await Effect.runPromise(
      uploadChatImage({
        conversationId: 'conv-1',
        files: [maliciousFile],
      }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.imageKey).toMatch(/^\d+-chat\/conv-1\/[0-9a-f-]{36}\.png$/)
  })

  it('refuses a file that is not an image, whatever it claims to be', async () => {
    const exit = await Effect.runPromiseExit(
      uploadChatImage({
        conversationId: 'conv-1',
        files: [mockFile],
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            createMockCurrentUser({ id: 'user-1' }),
            createMockGCSService(),
            createMockFileSystem(HTML_BYTES),
            createMockRateLimiterService()
          )
        )
      )
    )

    expect(failureOf(exit)).toBeInstanceOf(InvalidImageError)
  })

  it('should namespace uploads by conversation id', async () => {
    const result = await Effect.runPromise(
      uploadChatImage({
        conversationId: 'conv-abc',
        files: [mockFile],
      }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.imageUrl).toContain('conv-abc')
  })

  it('refuses the sixth upload in a minute and stores nothing for it', async () => {
    const privateUploads: GCSUploadRequest[] = []
    const upload = uploadChatImage({
      conversationId: 'conv-1',
      files: [mockFile],
    })

    const { firstFive, sixth } = await Effect.runPromise(
      Effect.gen(function* () {
        const firstFive = yield* Effect.forEach(Array.range(1, 5), () =>
          Effect.exit(upload)
        )
        const sixth = yield* Effect.exit(upload)
        return { firstFive, sixth }
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            createMockCurrentUser({ id: 'user-1' }),
            createMockGCSService({ privateUploads }),
            createMockFileSystem(),
            createMockRateLimiterService()
          )
        )
      )
    )

    expect(Array.every(firstFive, Exit.isSuccess)).toBe(true)
    expect(failureOf(sixth)).toBeInstanceOf(RateLimitExceededError)
    expect(privateUploads).toHaveLength(5)
  })
})
