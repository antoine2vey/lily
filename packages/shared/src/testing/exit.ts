import { Exit, Option, Result } from 'effect'

export const failureOf = <A, E>(
  outcome: Exit.Exit<A, E> | Result.Result<A, E>
): E =>
  Exit.isExit(outcome)
    ? Option.getOrThrowWith(
        Exit.findErrorOption(outcome),
        () => new Error(`Expected a typed failure, got ${String(outcome)}`)
      )
    : Result.getOrThrowWith(
        Result.flip(outcome),
        () => new Error(`Expected a failure, got ${String(outcome)}`)
      )

export const defectOf = <A, E>(exit: Exit.Exit<A, E>): unknown =>
  Result.getOrThrowWith(
    Exit.findDefect(exit),
    () => new Error(`Expected a defect, got ${String(exit)}`)
  )
