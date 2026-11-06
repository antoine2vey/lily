import { DateTime, Option, pipe, String } from 'effect'
import type { Locale } from '@/i18n'

export const formatPostDate = (
  locale: Locale,
  date: string,
  month: 'short' | 'long'
): string =>
  pipe(
    DateTime.make(date),
    Option.match({
      onNone: () => date,
      onSome: (dt) =>
        DateTime.format(dt, {
          locale: locale === 'fr' ? 'fr-FR' : 'en-US',
          month,
          day: 'numeric',
          year: 'numeric',
          timeZone: 'UTC',
        }),
    })
  )

export const categoryLabel = (category: string): string =>
  pipe(category, String.replaceAll('-', ' '))
