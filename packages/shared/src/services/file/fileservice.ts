import { FileSystem } from '@effect/platform/FileSystem'
import type { PersistedFile } from '@effect/platform/Multipart'
import { Effect, Match, Schema } from 'effect'

export class MultipleFilesError extends Schema.Class<MultipleFilesError>(
  'MultipleFilesError'
)({
  message: Schema.String,
}) {}

export class NoFilesError extends Schema.Class<NoFilesError>('NoFilesError')({
  message: Schema.String,
}) {}

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
    }
  }),
}) {}
