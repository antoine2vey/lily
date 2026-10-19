import { Data, Effect } from 'effect'

export class VacationClaimLost extends Data.TaggedError('VacationClaimLost')<{
  readonly userId: string
}> {}

const isClaimLost = (error: unknown): error is VacationClaimLost =>
  error instanceof VacationClaimLost

const MAX_RETRIES = 2

export const retryLostClaims = <A, E, R>(
  effect: Effect.Effect<A, E | VacationClaimLost, R>
) =>
  effect.pipe(
    Effect.retry({ while: isClaimLost, times: MAX_RETRIES }),
    Effect.catchIf(isClaimLost, (lost) => Effect.die(lost))
  )
