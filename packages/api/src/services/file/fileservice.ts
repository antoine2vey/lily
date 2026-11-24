import { Array as Arr, Context, Effect, Layer, Schema } from 'effect'
import { FileSystem } from 'effect/FileSystem'
import type { PersistedFile } from 'effect/http/Multipart'
import type { PlatformError } from 'effect/PlatformError'

export class MultipleFilesError extends Schema.Class<
  MultipleFilesError,
  { readonly brand: unique symbol }
>('MultipleFilesError')({
  message: Schema.String,
}) {}

export class NoFilesError extends Schema.Class<
  NoFilesError,
  { readonly brand: unique symbol }
>('NoFilesError')({
  message: Schema.String,
}) {}

export class TooManyFilesError extends Schema.Class<
  TooManyFilesError,
  { readonly brand: unique symbol }
>('TooManyFilesError')({
  message: Schema.String,
  max: Schema.Finite,
}) {}

export class FileTooLargeError extends Schema.Class<
  FileTooLargeError,
  { readonly brand: unique symbol }
>('FileTooLargeError')({
  message: Schema.String,
  fileName: Schema.String,
  size: Schema.Finite,
  maxSize: Schema.Finite,
}) {}

export class InvalidFileTypeError extends Schema.Class<
  InvalidFileTypeError,
  { readonly brand: unique symbol }
>('InvalidFileTypeError')({
  message: Schema.String,
  fileName: Schema.String,
  contentType: Schema.String,
}) {}

export {
  ALLOWED_IMAGE_TYPES,
  MAX_FILE_SIZE_BYTES,
  MAX_SCAN_FILES,
} from '@lily/shared'

import {
  ALLOWED_IMAGE_TYPES,
  MAX_FILE_SIZE_BYTES,
  MAX_SCAN_FILES,
} from '@lily/shared'

export const PersistedFileBuffer = Schema.Struct({
  buffer: Schema.Uint8Array,
  key: Schema.String,
  name: Schema.String,
  contentType: Schema.String,
  path: Schema.String,
})
export type PersistedFileBuffer = Schema.Schema.Type<typeof PersistedFileBuffer>

export class FileService extends Context.Service<FileService>()('FileService', {
  make: Effect.gen(function* () {
    const fileSystem = yield* FileSystem

    return {
      getFirstUploadedFile: (
        files: readonly PersistedFile[]
      ): Effect.Effect<
        PersistedFileBuffer,
        MultipleFilesError | NoFilesError | PlatformError
      > =>
        Effect.gen(function* () {
          if (files.length === 0) {
            return yield* Effect.fail(
              new NoFilesError({
                message: 'No files provided',
              })
            )
          }

          if (files.length > 1) {
            return yield* Effect.fail(
              new MultipleFilesError({
                message: 'Multiple files provided',
              })
            )
          }

          // At this point we know files.length === 1, so files[0] is guaranteed to exist
          const file = Arr.getUnsafe(files, 0)
          const buffer = yield* fileSystem.readFile(file.path)

          return {
            buffer,
            key: file.key,
            name: file.name,
            contentType: file.contentType,
            path: file.path,
          }
        }),

      getUploadedFiles: (
        files: readonly PersistedFile[],
        opts?: { maxFiles?: number }
      ): Effect.Effect<
        PersistedFileBuffer[],
        | NoFilesError
        | TooManyFilesError
        | InvalidFileTypeError
        | FileTooLargeError
        | PlatformError
      > =>
        Effect.gen(function* () {
          const maxFiles = opts?.maxFiles ?? MAX_SCAN_FILES

          if (files.length === 0) {
            return yield* Effect.fail(
              new NoFilesError({ message: 'No files provided' })
            )
          }

          if (files.length > maxFiles) {
            return yield* Effect.fail(
              new TooManyFilesError({
                message: `Too many files provided. Maximum is ${maxFiles}`,
                max: maxFiles,
              })
            )
          }

          const results = yield* Effect.forEach(
            Arr.fromIterable(files),
            (file) =>
              Effect.gen(function* () {
                const isAllowed = Arr.contains(
                  ALLOWED_IMAGE_TYPES,
                  file.contentType
                )
                if (!isAllowed) {
                  return yield* Effect.fail(
                    new InvalidFileTypeError({
                      message: `Invalid file type: ${file.contentType}. Allowed: ${Arr.join(ALLOWED_IMAGE_TYPES, ', ')}`,
                      fileName: file.name,
                      contentType: file.contentType,
                    })
                  )
                }

                const buffer = yield* fileSystem.readFile(file.path)

                if (buffer.byteLength > MAX_FILE_SIZE_BYTES) {
                  return yield* Effect.fail(
                    new FileTooLargeError({
                      message: `File ${file.name} is too large (${buffer.byteLength} bytes). Maximum is ${MAX_FILE_SIZE_BYTES} bytes`,
                      fileName: file.name,
                      size: buffer.byteLength,
                      maxSize: MAX_FILE_SIZE_BYTES,
                    })
                  )
                }

                return {
                  buffer,
                  key: file.key,
                  name: file.name,
                  contentType: file.contentType,
                  path: file.path,
                }
              })
          )

          return results
        }),
    }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
