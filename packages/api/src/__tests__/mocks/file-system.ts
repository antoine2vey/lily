import { PNG_BYTES } from '@lily/api/__tests__/fixtures/images'
import { Effect, Layer } from 'effect'
import { FileSystem } from 'effect/FileSystem'

export const createMockFileSystem = (
  fileBytes: Uint8Array = PNG_BYTES
): Layer.Layer<FileSystem> => {
  const mockFileSystem = {
    readFile: (_path: string) => Effect.succeed(fileBytes), // Mock PNG header
    writeFile: () => Effect.void,
    exists: () => Effect.succeed(true),
    stat: () =>
      Effect.succeed({
        type: 'File' as const,
        size: 1024,
        mtime: new Date(),
        atime: new Date(),
        ctime: new Date(),
      }),
  }

  return Layer.succeed(
    FileSystem,
    mockFileSystem as unknown as typeof FileSystem.Service
  )
}
