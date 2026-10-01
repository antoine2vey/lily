import { Effect } from 'effect'

/**
 * Runs `body` while `while` holds, feeding each result into the next turn.
 */
export const iterate = <S, E, R>(
  initial: S,
  options: {
    readonly while: (state: S) => boolean
    readonly body: (state: S) => Effect.Effect<S, E, R>
  }
): Effect.Effect<S, E, R> =>
  Effect.gen(function* () {
    let state = initial
    while (options.while(state)) {
      state = yield* options.body(state)
    }
    return state
  })
