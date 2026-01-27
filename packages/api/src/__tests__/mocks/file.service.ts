import type { PersistedFile } from '@effect/platform/Multipart'
import {
  FileService,
  type FileTooLargeError,
  type InvalidFileTypeError,
  MultipleFilesError,
  NoFilesError,
  type PersistedFileBuffer,
  type TooManyFilesError,
} from '@lily/shared/services/file/fileservice'
import { Effect, Layer } from 'effect'

export const createMockFileService = (): Layer.Layer<FileService> => {
  const mockService = {
    getFirstUploadedFile: (
      files: readonly PersistedFile[]
    ): Effect.Effect<
      PersistedFileBuffer,
      MultipleFilesError | NoFilesError
    > => {
      if (files.length === 0) {
        return Effect.fail(new NoFilesError({ message: 'No files provided' }))
      }

      if (files.length > 1) {
        return Effect.fail(
          new MultipleFilesError({ message: 'Multiple files provided' })
        )
      }

      const file = files[0]
      if (!file) {
        return Effect.fail(new NoFilesError({ message: 'No files provided' }))
      }
      return Effect.succeed({
        buffer: new Uint8Array([0x89, 0x50, 0x4e, 0x47]), // Mock PNG header
        key: file.key,
        name: file.name,
        contentType: file.contentType,
        path: file.path,
      })
    },
    getUploadedFiles: (
      files: readonly PersistedFile[],
      _opts?: { maxFiles?: number }
    ): Effect.Effect<
      PersistedFileBuffer[],
      | NoFilesError
      | TooManyFilesError
      | InvalidFileTypeError
      | FileTooLargeError
    > => {
      if (files.length === 0) {
        return Effect.fail(new NoFilesError({ message: 'No files provided' }))
      }
      return Effect.succeed(
        Array.from(files).map((file) => ({
          buffer: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
          key: file.key,
          name: file.name,
          contentType: file.contentType,
          path: file.path,
        }))
      )
    },
  }

  return Layer.succeed(
    FileService,
    mockService as unknown as typeof FileService.Service
  )
}
