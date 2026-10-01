import { Exit, Option } from 'effect'

export const failureOf = <A, E>(exit: Exit.Exit<A, E>): E =>
  Option.getOrThrowWith(
    Exit.findErrorOption(exit),
    () => new Error(`Expected a typed failure, got ${String(exit)}`)
  )
