import { Exit, Option } from 'effect'

/** The typed failure of `exit`; throws when it succeeded or died instead. */
export const failureOf = <A, E>(exit: Exit.Exit<A, E>): E =>
  Option.getOrThrowWith(
    Exit.findErrorOption(exit),
    () => new Error(`Expected a typed failure, got ${String(exit)}`)
  )
