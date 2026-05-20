import { String as EffectString, Option, pipe } from 'effect'

/**
 * Trim a string and collapse whitespace-only / empty / nullish values to
 * `null`. Returns the trimmed string when at least one non-whitespace
 * character remains.
 *
 * Why: write-paths that accept optional user-supplied names (OAuth full
 * names, profile-edit fields) need a single shared rule for "what counts as
 * a meaningful value" — without this helper, every endpoint reinvents the
 * same Option pipeline.
 */
export const trimAndNullify = (
  value: string | null | undefined
): string | null =>
  pipe(
    Option.fromNullable(value),
    Option.map(EffectString.trim),
    Option.filter((s) => s.length > 0),
    Option.getOrElse<string | null>(() => null)
  )
