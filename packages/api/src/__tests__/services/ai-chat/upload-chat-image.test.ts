import type { PersistedFile } from '@effect/platform/Multipart'
import { createMockFileSystem } from '@lily/api/__tests__/mocks/file-system'
import { createMockGCSService } from '@lily/api/__tests__/mocks/gcs.service'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { uploadChatImage } from '@lily/api/services/ai-chat/endpoints/upload-chat-image'
import { Effect, Layer } from 'effect'
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
      createMockFileSystem()
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

  it('should sanitize path traversal from filename', async () => {
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

    expect(result.imageKey).not.toContain('..')
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
})
