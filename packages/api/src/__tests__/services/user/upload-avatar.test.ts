import type { PersistedFile } from '@effect/platform/Multipart'
import { mockUsers } from '@lily/api/__tests__/fixtures/users'
import { createMockFileService } from '@lily/api/__tests__/mocks/file.service'
import { createMockFileSystem } from '@lily/api/__tests__/mocks/file-system'
import { createMockGCSService } from '@lily/api/__tests__/mocks/gcs.service'
import { createMockCurrentUser } from '@lily/api/__tests__/mocks/session'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { uploadAvatar } from '@lily/api/services/user/endpoints/upload-avatar'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('uploadAvatar', () => {
  const mockFile = {
    _tag: 'PersistedFile',
    key: 'files',
    name: 'avatar.jpg',
    contentType: 'image/jpeg',
    path: '/tmp/avatar.jpg',
  } as unknown as PersistedFile

  const createTestLayer = () =>
    Layer.mergeAll(
      createMockUserRepository(mockUsers),
      createMockGCSService(),
      createMockFileService(),
      createMockFileSystem(),
      createMockCurrentUser({ id: 'user-1' })
    )

  it('should upload avatar and return url', async () => {
    const result = await Effect.runPromise(
      uploadAvatar([mockFile]).pipe(Effect.provide(createTestLayer()))
    )

    expect(result).toHaveProperty('url')
    expect(result.url).toContain('storage.googleapis.com')
  })

  it('should fail when user not found', async () => {
    const layer = Layer.mergeAll(
      createMockUserRepository(mockUsers),
      createMockGCSService(),
      createMockFileService(),
      createMockFileSystem(),
      createMockCurrentUser({ id: 'non-existent' })
    )

    const result = await Effect.runPromiseExit(
      uploadAvatar([mockFile]).pipe(Effect.provide(layer))
    )

    expect(result._tag).toBe('Failure')
  })

  it('should fail when no files provided', async () => {
    const result = await Effect.runPromiseExit(
      uploadAvatar([]).pipe(Effect.provide(createTestLayer()))
    )

    expect(result._tag).toBe('Failure')
  })
})
