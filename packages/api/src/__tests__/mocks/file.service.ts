import { PNG_BYTES } from '@lily/api/__tests__/fixtures/images'
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
import type { PersistedFile } from 'effect/http/Multipart'

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
        buffer: PNG_BYTES,
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
          buffer: PNG_BYTES,
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
