import { Exit, Option, Result } from 'effect'

export const failureOf = <A, E>(exit: Exit.Exit<A, E>): E =>
  Option.getOrThrowWith(
    Exit.findErrorOption(exit),
    () => new Error(`Expected a typed failure, got ${String(exit)}`)
  )

export const defectOf = <A, E>(exit: Exit.Exit<A, E>): unknown =>
  Result.getOrThrowWith(
    Exit.findDefect(exit),
    () => new Error(`Expected a defect, got ${String(exit)}`)
  )
