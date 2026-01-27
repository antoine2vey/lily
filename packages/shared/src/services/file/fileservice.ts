import { FileSystem } from '@effect/platform/FileSystem'
import type { PersistedFile } from '@effect/platform/Multipart'
import { Array as Arr, Effect, Match, Schema } from 'effect'

export class MultipleFilesError extends Schema.Class<MultipleFilesError>(
  'MultipleFilesError'
)({
  message: Schema.String,
}) {}

export class NoFilesError extends Schema.Class<NoFilesError>('NoFilesError')({
  message: Schema.String,
}) {}

export class TooManyFilesError extends Schema.Class<TooManyFilesError>(
  'TooManyFilesError'
)({
  message: Schema.String,
  max: Schema.Number,
}) {}

export class FileTooLargeError extends Schema.Class<FileTooLargeError>(
  'FileTooLargeError'
)({
  message: Schema.String,
  fileName: Schema.String,
  size: Schema.Number,
  maxSize: Schema.Number,
}) {}

export class InvalidFileTypeError extends Schema.Class<InvalidFileTypeError>(
  'InvalidFileTypeError'
)({
  message: Schema.String,
  fileName: Schema.String,
  contentType: Schema.String,
}) {}

export {
  ALLOWED_IMAGE_TYPES,
  MAX_FILE_SIZE_BYTES,
  MAX_SCAN_FILES,
} from '../../domains/plant/constants'

import {
  ALLOWED_IMAGE_TYPES,
  MAX_FILE_SIZE_BYTES,
  MAX_SCAN_FILES,
} from '../../domains/plant/constants'

export const PersistedFileBuffer = Schema.Struct({
  buffer: Schema.Uint8Array,
  key: Schema.String,
  name: Schema.String,
  contentType: Schema.String,
  path: Schema.String,
})
export type PersistedFileBuffer = Schema.Schema.Type<typeof PersistedFileBuffer>

export class FileService extends Effect.Service<FileService>()('FileService', {
  effect: Effect.gen(function* () {
    return {
      getFirstUploadedFile: (
        files: readonly PersistedFile[]
      ): Effect.Effect<
        PersistedFileBuffer,
        MultipleFilesError | NoFilesError,
        FileSystem
      > =>
        Effect.gen(function* () {
          const fileSystem = yield* FileSystem

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
          const ensureFile = Match.type<PersistedFile | undefined>().pipe(
            Match.withReturnType<PersistedFile>(),
            Match.when(Match.undefined, () => {
              throw new Error('No files provided')
            }),
            Match.when({ path: Match.string }, (file) => {
              return file
            }),
            Match.orElse(() => {
              throw new Error('No files provided')
            })
          )

          const file = ensureFile(files[0])
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
        | FileTooLargeError,
        FileSystem
      > =>
        Effect.gen(function* () {
          const fileSystem = yield* FileSystem
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
                // Validate content type
                const isAllowed = Arr.contains(
                  ALLOWED_IMAGE_TYPES as unknown as string[],
                  file.contentType
                )
                if (!isAllowed) {
                  return yield* Effect.fail(
                    new InvalidFileTypeError({
                      message: `Invalid file type: ${file.contentType}. Allowed: ${Arr.join(ALLOWED_IMAGE_TYPES as unknown as string[], ', ')}`,
                      fileName: file.name,
                      contentType: file.contentType,
                    })
                  )
                }

                const buffer = yield* fileSystem.readFile(file.path)

                // Validate file size
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
}) {}
