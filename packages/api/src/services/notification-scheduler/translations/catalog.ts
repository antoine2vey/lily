import type {
  LegacyParamsOf,
  LegacyTopic,
  ParamsOf,
  SimpleNotificationType,
} from '@lily/api/services/notification-scheduler/translations/params'
import { Array, Match, Option } from 'effect'

export interface NotificationContent {
  readonly title: string
  readonly body: string
}

/** Every simple topic's push, written in one language from its typed params. */
export interface Language {
  readonly topics: {
    readonly [T in SimpleNotificationType]: (
      params: ParamsOf<T>
    ) => NotificationContent
  }
  readonly legacy: {
    readonly [T in LegacyTopic]: (
      params: LegacyParamsOf<T>
    ) => NotificationContent
  }
  /** Several anniversaries landing in one poll, collapsed into one push. */
  readonly anniversaries: (
    plantNames: ReadonlyArray<string>
  ) => NotificationContent
}

export const MAX_PLANT_NAMES_IN_BODY = 5

export const MONTHS_PER_YEAR = 12

/** The first five names, then the language's "and N more". */
export const listNames = (
  names: ReadonlyArray<string>,
  andMore: (remaining: number) => string
): string => {
  const visible = Array.join(Array.take(names, MAX_PLANT_NAMES_IN_BODY), ', ')
  const remaining = names.length - MAX_PLANT_NAMES_IN_BODY
  return remaining > 0 ? `${visible} ${andMore(remaining)}` : visible
}

// Keep a recap clause only when its count is non-zero. Without this guard a 0
// reaches the reader as "a 0-day streak" or "0 plants thriving" — technically
// correct, emotionally wrong. We'd rather drop the clause than report a zero.
export const recapClause = (
  keep: boolean,
  text: string
): Option.Option<string> => (keep ? Option.some(text) : Option.none())

// Natural-language list join, only ever called with 2+ clauses. English takes
// an Oxford comma ("a, b, and c"); French omits it ("a, b et c"). Recaps carry
// at most three stats, so 2 and 3 are the only lengths we handle.
export const joinClauses = (
  parts: ReadonlyArray<string>,
  conjunction: string,
  oxford: boolean
): string =>
  Match.value(parts.length).pipe(
    Match.when(3, () => {
      const last = Option.getOrElse(Array.last(parts), () => '')
      const head = Array.join(Array.dropRight(parts, 1), ', ')
      return `${head}${oxford ? ',' : ''} ${conjunction} ${last}`
    }),
    Match.orElse(() => Array.join(parts, ` ${conjunction} `))
  )
