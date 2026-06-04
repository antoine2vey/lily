import { type CalendarAge, getCalendarAge, now } from '@lily/shared'
import { Array, DateTime, Match, Option, pipe } from 'effect'

/**
 * Minimal translate signature — assignable from react-i18next's `t`. Mirrors
 * the helper-with-`t` pattern used in PlantShareCard.
 */
type Translate = (
  key: string,
  options: { count?: number; duration?: string }
) => string

/**
 * Turn a calendar age into a humanized, localized duration such as
 * "1 month and 2 days" / "1 mois et 2 jours". Non-zero units (years, months,
 * days) are joined with localized separators; an all-zero age falls back to the
 * ICU `=0` case of `ageDays` ("less than a day").
 */
export const humanizeAge = (age: CalendarAge, t: Translate): string => {
  const units = pipe(
    [
      { count: age.years, key: 'gallery.ageYears' },
      { count: age.months, key: 'gallery.ageMonths' },
      { count: age.days, key: 'gallery.ageDays' },
    ],
    Array.filter((unit) => unit.count > 0),
    Array.map((unit) => t(unit.key, { count: unit.count }))
  )

  return pipe(
    Match.value(units.length),
    Match.when(0, () => t('gallery.ageDays', { count: 0 })),
    Match.when(1, () =>
      pipe(
        Array.head(units),
        Option.getOrElse(() => '')
      )
    ),
    Match.orElse(() => {
      const last = pipe(
        Array.last(units),
        Option.getOrElse(() => '')
      )
      const head = pipe(
        Array.dropRight(units, 1),
        Array.join(t('gallery.ageSeparator', {}))
      )
      return `${head}${t('gallery.ageJoiner', {})}${last}`
    })
  )
}

/**
 * Build the full "Growing for {duration}" label from the date a plant was added.
 */
export const buildGrowingForLabel = (dateAdded: Date, t: Translate): string =>
  t('gallery.growingFor', {
    duration: humanizeAge(
      getCalendarAge(DateTime.unsafeMake(dateAdded), now()),
      t
    ),
  })
