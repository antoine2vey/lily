import { CommandExecutor } from '@effect/platform'
import { Effect, Layer, Stream } from 'effect'

/**
 * Mock CommandExecutor that does nothing (for testing)
 */
export const createMockCommandExecutor =
  (): Layer.Layer<CommandExecutor.CommandExecutor> =>
    Layer.succeed(
      CommandExecutor.CommandExecutor,
      CommandExecutor.makeExecutor(() =>
        Effect.succeed({
          [CommandExecutor.ProcessTypeId]: CommandExecutor.ProcessTypeId,
          pid: CommandExecutor.ProcessId(1234),
          exitCode: Effect.succeed(CommandExecutor.ExitCode(0)),
          isRunning: Effect.succeed(false),
          kill: () => Effect.void,
          stdin: Stream.never,
          stdout: Stream.empty,
          stderr: Stream.empty,
          toJSON: () => ({}),
          [Symbol.for('nodejs.util.inspect.custom')]: () => ({}),
        } as unknown as CommandExecutor.Process)
      )
    )
