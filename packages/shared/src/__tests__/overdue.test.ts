import { describe, expect, it } from 'vitest'
import { earliestOverdueDate } from '../domains/notification/overdue'

describe('earliestOverdueDate', () => {
  const now = new Date('2024-06-15T12:00:00Z')

  it('returns the earliest date at or before now, ignoring nulls and future dates', () => {
    const result = earliestOverdueDate(
      [
        new Date('2024-06-14T08:00:00Z'),
        null,
        new Date('2024-06-10T08:00:00Z'),
        new Date('2024-06-20T08:00:00Z'),
        now,
      ],
      now
    )

    expect(result.toISOString()).toBe('2024-06-10T08:00:00.000Z')
  })

  it('falls back to now when no date qualifies', () => {
    const result = earliestOverdueDate(
      [null, new Date('2024-06-16T00:00:00Z')],
      now
    )

    expect(result).toBe(now)
  })
})
