import type { PersistedFile } from '@effect/platform/Multipart'
import {
  FileService,
  MultipleFilesError,
  NoFilesError,
  type PersistedFileBuffer,
} from '@lily/shared/services/file/fileservice'
import { Effect, Layer } from 'effect'

export const createMockFileService = (): Layer.Layer<FileService> => {
  const mockService = {
    getFirstUploadedFile: (
      files: readonly PersistedFile[]
    ): Effect.Effect<PersistedFileBuffer, MultipleFilesError | NoFilesError> => {
      if (files.length === 0) {
        return Effect.fail(new NoFilesError({ message: 'No files provided' }))
      }

      if (files.length > 1) {
        return Effect.fail(
          new MultipleFilesError({ message: 'Multiple files provided' })
        )
      }

      const file = files[0]!
      return Effect.succeed({
        buffer: new Uint8Array([0x89, 0x50, 0x4e, 0x47]), // Mock PNG header
        key: file.key,
        name: file.name,
        contentType: file.contentType,
        path: file.path,
      })
    },
  }

  return Layer.succeed(
    FileService,
    mockService as unknown as typeof FileService.Service
  )
}
