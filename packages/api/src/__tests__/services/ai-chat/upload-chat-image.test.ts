import type { PersistedFile } from '@effect/platform/Multipart'
import { mockPlants } from '@lily/api/__tests__/fixtures/plants'
import { createMockFileSystem } from '@lily/api/__tests__/mocks/file-system'
import { createMockGCSService } from '@lily/api/__tests__/mocks/gcs.service'
import { createMockPlantRepository } from '@lily/api/__tests__/mocks/plant.repository'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { uploadChatImage } from '@lily/api/services/ai-chat/endpoints/upload-chat-image'
import { Cause, Effect, Exit, Layer, Option } from 'effect'
import { describe, expect, it } from 'vitest'

const mockFile = {
  _tag: 'PersistedFile' as const,
  key: 'file',
  name: 'photo.jpg',
  contentType: 'image/jpeg',
  path: '/tmp/upload-12345/photo.jpg',
} as unknown as PersistedFile

describe('uploadChatImage', () => {
  const createTestLayer = () =>
    Layer.mergeAll(
      createMockPlantRepository({ plants: [...mockPlants] }),
      createMockCurrentUser({ id: 'user-1' }),
      createMockGCSService(),
      createMockFileSystem()
    )

  it('should upload an image and return a signed URL', async () => {
    const result = await Effect.runPromise(
      uploadChatImage({ plantId: 'plant-1', files: [mockFile] }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.imageUrl).toBeDefined()
    expect(result.imageUrl).toContain('signed=true')
    expect(result.imageKey).toBeDefined()
  })

  it('should fail with PlantNotFoundError when plant does not exist', async () => {
    const exit = await Effect.runPromiseExit(
      uploadChatImage({
        plantId: 'nonexistent',
        files: [mockFile],
      }).pipe(Effect.provide(createTestLayer()))
    )

    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const error = Cause.failureOption(exit.cause)
      expect(Option.isSome(error)).toBe(true)
      if (Option.isSome(error)) {
        expect(error.value._tag).toBe('PlantNotFoundError')
      }
    }
  })

  it('should fail with PlantNotFoundError when user does not own the plant', async () => {
    // plant-3 belongs to user-2, currentUser is user-1
    const exit = await Effect.runPromiseExit(
      uploadChatImage({
        plantId: 'plant-3',
        files: [mockFile],
      }).pipe(Effect.provide(createTestLayer()))
    )

    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const error = Cause.failureOption(exit.cause)
      expect(Option.isSome(error)).toBe(true)
      if (Option.isSome(error)) {
        expect(error.value._tag).toBe('PlantNotFoundError')
      }
    }
  })

  it('should fail when files array is empty', async () => {
    await expect(
      Effect.runPromise(
        uploadChatImage({ plantId: 'plant-1', files: [] }).pipe(
          Effect.provide(createTestLayer())
        )
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
        plantId: 'plant-1',
        files: [maliciousFile],
      }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.imageKey).not.toContain('..')
  })

  it('should build the correct file path structure', async () => {
    const result = await Effect.runPromise(
      uploadChatImage({ plantId: 'plant-1', files: [mockFile] }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    // The key returned by the mock GCS includes a timestamp prefix,
    // but the fileName passed to uploadPrivateFile starts with chat/{plantId}/
    // We verify the signed URL contains the plant-1 path segment
    expect(result.imageUrl).toContain('plant-1')
  })

  it('should fail with PlantNotFoundError for delegated plant access', async () => {
    // uploadChatImage only checks plant.userId === userId,
    // so a plant owned by another user always fails even if delegated
    const layer = Layer.mergeAll(
      createMockPlantRepository({ plants: [...mockPlants] }),
      createMockCurrentUser({ id: 'user-1' }),
      createMockGCSService(),
      createMockFileSystem()
    )

    const exit = await Effect.runPromiseExit(
      uploadChatImage({
        plantId: 'plant-3', // owned by user-2
        files: [mockFile],
      }).pipe(Effect.provide(layer))
    )

    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const error = Cause.failureOption(exit.cause)
      expect(Option.isSome(error)).toBe(true)
      if (Option.isSome(error)) {
        expect(error.value._tag).toBe('PlantNotFoundError')
      }
    }
  })
})
