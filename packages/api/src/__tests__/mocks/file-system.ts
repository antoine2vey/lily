import { FileSystem } from '@effect/platform/FileSystem'
import { Effect, Layer } from 'effect'

export const createMockFileSystem = (): Layer.Layer<FileSystem> => {
  const mockFileSystem = {
    readFile: (_path: string) =>
      Effect.succeed(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), // Mock PNG header
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
