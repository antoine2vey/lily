interface Tagged {
  readonly _tag: string
}

/** One answer per refusal. A refusal with no entry does not compile. */
export type RefusalTable<R extends Tagged> = {
  readonly [T in R['_tag']]: (
    refusal: Extract<R, { readonly _tag: T }>
  ) => unknown
}

export type ErrorOf<
  R extends Tagged,
  M extends RefusalTable<R>,
  F extends R,
> = ReturnType<M[F['_tag']]>

export type RefusalMapper<R extends Tagged, M extends RefusalTable<R>> = <
  F extends R,
>(
  refusal: F
) => ErrorOf<R, M, F>

/**
 * Turns the refusals of a context into the errors its callers see, keeping
 * for each refusal the exact error its entry answers.
 *
 * ```typescript
 * const asError = refusals<Refusal>()(errorOf)
 * ```
 */
export const refusals =
  <R extends Tagged>() =>
  <M extends RefusalTable<R>>(table: M): RefusalMapper<R, M> =>
  <F extends R>(refusal: F) => {
    // TypeScript cannot tie the entry it picks to the tag of `refusal`.
    const answer = table[refusal._tag as F['_tag']] as unknown as (
      refusal: F
    ) => ErrorOf<R, M, F>
    return answer(refusal)
  }
