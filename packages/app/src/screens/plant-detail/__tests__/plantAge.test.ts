import { buildGrowingForLabel, humanizeAge } from '../plantAge'

/** Fake translate mimicking the English ICU output for the age keys. */
const fakeT = (
  key: string,
  options?: { count?: number; duration?: string }
): string => {
  const count = options?.count ?? 0
  const plural = (noun: string) =>
    count === 1 ? `${count} ${noun}` : `${count} ${noun}s`

  if (key === 'gallery.ageYears') return plural('year')
  if (key === 'gallery.ageMonths') return plural('month')
  if (key === 'gallery.ageDays')
    return count === 0 ? 'less than a day' : plural('day')
  if (key === 'gallery.ageSeparator') return ', '
  if (key === 'gallery.ageJoiner') return ' and '
  if (key === 'gallery.growingFor') return `Growing for ${options?.duration}`
  return key
}

describe('humanizeAge', () => {
  it('joins a month and days with "and"', () => {
    expect(humanizeAge({ years: 0, months: 1, days: 2 }, fakeT)).toBe(
      '1 month and 2 days'
    )
  })

  it('renders a single unit on its own', () => {
    expect(humanizeAge({ years: 0, months: 0, days: 5 }, fakeT)).toBe('5 days')
  })

  it('joins three units with separators and a final "and"', () => {
    expect(humanizeAge({ years: 1, months: 2, days: 3 }, fakeT)).toBe(
      '1 year, 2 months and 3 days'
    )
  })

  it('drops zero-valued units', () => {
    expect(humanizeAge({ years: 2, months: 0, days: 1 }, fakeT)).toBe(
      '2 years and 1 day'
    )
  })

  it('falls back to "less than a day" for an all-zero age', () => {
    expect(humanizeAge({ years: 0, months: 0, days: 0 }, fakeT)).toBe(
      'less than a day'
    )
  })
})

describe('buildGrowingForLabel', () => {
  it('wraps the humanized age in the growing-for label', () => {
    // Far in the past so the duration is non-trivial regardless of "now".
    const label = buildGrowingForLabel(new Date('2020-01-01T00:00:00Z'), fakeT)
    expect(label.startsWith('Growing for ')).toBe(true)
  })
})
