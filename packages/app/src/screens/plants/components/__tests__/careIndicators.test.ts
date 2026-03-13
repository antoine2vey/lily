import { Option } from 'effect'
import type { TFunction } from 'i18next'
import { type CareStatus, formatDays, getCareIndicator } from '../PlantCard'

// Mock translation function that returns expected values for tests
const mockT: TFunction = ((key: string, options?: { count?: number }) => {
  if (key === 'card.today') return 'Today'
  if (key === 'card.tomorrow') return 'Tomorrow'
  if (key === 'card.overdue') return 'Overdue'
  if (key === 'card.daysCount' && options?.count !== undefined) {
    return `${options.count} days`
  }
  return key
}) as TFunction

describe('formatDays', () => {
  it('returns "Today" for 0 days', () => {
    expect(formatDays(0, mockT)).toBe('Today')
  })

  it('returns "Tomorrow" for 1 day', () => {
    expect(formatDays(1, mockT)).toBe('Tomorrow')
  })

  it('returns "X days" for 2+ days', () => {
    expect(formatDays(2, mockT)).toBe('2 days')
    expect(formatDays(5, mockT)).toBe('5 days')
    expect(formatDays(30, mockT)).toBe('30 days')
  })
})

describe('getCareIndicator', () => {
  it('returns None when daysUntil is undefined', () => {
    const care: CareStatus = { daysUntil: undefined, isOverdue: false }

    const result = getCareIndicator(care, 'watering', mockT)

    expect(Option.isNone(result)).toBe(true)
  })

  it('returns overdue indicator when isOverdue is true', () => {
    const care: CareStatus = { daysUntil: 0, isOverdue: true }

    const result = getCareIndicator(care, 'watering', mockT)

    expect(Option.isSome(result)).toBe(true)
    expect(Option.getOrThrow(result)).toEqual({
      type: 'watering',
      text: 'Overdue',
      daysUntil: 0,
      isUrgent: true,
      isOverdue: true,
      isToday: false,
      icon: 'water-drop',
    })
  })

  it('returns correct indicator for water type', () => {
    const care: CareStatus = { daysUntil: 3, isOverdue: false }

    const result = getCareIndicator(care, 'watering', mockT)

    expect(Option.isSome(result)).toBe(true)
    expect(Option.getOrThrow(result)).toEqual({
      type: 'watering',
      text: '3 days',
      daysUntil: 3,
      isUrgent: false,
      isOverdue: false,
      isToday: false,
      icon: 'water-drop',
    })
  })

  it('returns correct indicator for fertilize type', () => {
    const care: CareStatus = { daysUntil: 5, isOverdue: false }

    const result = getCareIndicator(care, 'fertilization', mockT)

    expect(Option.isSome(result)).toBe(true)
    expect(Option.getOrThrow(result)).toEqual({
      type: 'fertilization',
      text: '5 days',
      daysUntil: 5,
      isUrgent: false,
      isOverdue: false,
      isToday: false,
      icon: 'spa',
    })
  })

  it('marks isUrgent true when daysUntil is 0', () => {
    const care: CareStatus = { daysUntil: 0, isOverdue: false }

    const result = getCareIndicator(care, 'watering', mockT)

    expect(Option.isSome(result)).toBe(true)
    expect(Option.getOrThrow(result).isUrgent).toBe(true)
    expect(Option.getOrThrow(result).text).toBe('Today')
  })

  it('marks isUrgent false when daysUntil is greater than 0', () => {
    const care: CareStatus = { daysUntil: 1, isOverdue: false }

    const result = getCareIndicator(care, 'watering', mockT)

    expect(Option.isSome(result)).toBe(true)
    expect(Option.getOrThrow(result).isUrgent).toBe(false)
  })

  it('returns None when daysUntil exceeds MAX_VISIBLE_DAYS', () => {
    const care: CareStatus = { daysUntil: 20, isOverdue: false }

    const result = getCareIndicator(care, 'watering', mockT)

    expect(Option.isNone(result)).toBe(true)
  })

  it('returns Some at exactly 14 days', () => {
    const care: CareStatus = { daysUntil: 14, isOverdue: false }

    const result = getCareIndicator(care, 'watering', mockT)

    expect(Option.isSome(result)).toBe(true)
  })

  it('always returns overdue regardless of MAX_VISIBLE_DAYS', () => {
    const care: CareStatus = { daysUntil: 0, isOverdue: true }

    const result = getCareIndicator(care, 'watering', mockT)

    expect(Option.isSome(result)).toBe(true)
    expect(Option.getOrThrow(result).isOverdue).toBe(true)
  })
})
