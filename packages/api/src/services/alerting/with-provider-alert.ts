import type {
  AlertProvider,
  IAlerter,
} from '@lily/api/services/alerting/service'
import { Effect, Predicate } from 'effect'

type TaggedError = { readonly _tag: string }

const isTaggedError: Predicate.Refinement<unknown, TaggedError> = (
  x
): x is TaggedError =>
  Predicate.isRecord(x) && '_tag' in x && typeof x._tag === 'string'

const messageOf = (error: unknown): string => {
  if (error instanceof Error) return error.message
  if (
    Predicate.isRecord(error) &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message
  }
  return String(error)
}

export interface WithProviderAlertOptions {
  readonly provider: AlertProvider
  readonly userId?: string
}

/**
 * Wrap an external-provider effect so failures are reported to the Alerter
 * (fire-and-forget) and re-raised unchanged.
 *
 * The alerter instance is captured up-front (typically inside a layer
 * constructor) so the returned decorator preserves the effect's R channel —
 * callers don't gain an `Alerter` dependency.
 *
 * Defects aren't handled here — the AlertingMiddleware reports unhandled
 * defects via the 5xx response path.
 */
export const withProviderAlert =
  (alerter: IAlerter, opts: WithProviderAlertOptions) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    effect.pipe(
      Effect.tapError((error) => {
        const errorTag = isTaggedError(error) ? error._tag : 'UnknownError'
        return alerter.alert({
          _tag: 'ProviderError',
          provider: opts.provider,
          errorTag,
          message: messageOf(error),
          ...(opts.userId !== undefined ? { userId: opts.userId } : {}),
        })
      })
    )
