import { Option } from 'effect'
import type { TFunction } from 'i18next'
import {
  type CareStatus,
  formatDays,
  getCareIndicator,
  getCareIndicators,
} from '../PlantCard'

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

    const result = getCareIndicator(care, 'water', mockT)

    expect(Option.isNone(result)).toBe(true)
  })

  it('returns overdue indicator when isOverdue is true', () => {
    const care: CareStatus = { daysUntil: 0, isOverdue: true }

    const result = getCareIndicator(care, 'water', mockT)

    expect(Option.isSome(result)).toBe(true)
    expect(Option.getOrThrow(result)).toEqual({
      type: 'water',
      text: 'Overdue',
      isUrgent: true,
      isOverdue: true,
      isToday: false,
      icon: 'water-drop',
    })
  })

  it('returns correct indicator for water type', () => {
    const care: CareStatus = { daysUntil: 3, isOverdue: false }

    const result = getCareIndicator(care, 'water', mockT)

    expect(Option.isSome(result)).toBe(true)
    expect(Option.getOrThrow(result)).toEqual({
      type: 'water',
      text: '3 days',
      isUrgent: false,
      isOverdue: false,
      isToday: false,
      icon: 'water-drop',
    })
  })

  it('returns correct indicator for fertilize type', () => {
    const care: CareStatus = { daysUntil: 5, isOverdue: false }

    const result = getCareIndicator(care, 'fertilize', mockT)

    expect(Option.isSome(result)).toBe(true)
    expect(Option.getOrThrow(result)).toEqual({
      type: 'fertilize',
      text: '5 days',
      isUrgent: false,
      isOverdue: false,
      isToday: false,
      icon: 'spa',
    })
  })

  it('marks isUrgent true when daysUntil is 0', () => {
    const care: CareStatus = { daysUntil: 0, isOverdue: false }

    const result = getCareIndicator(care, 'water', mockT)

    expect(Option.isSome(result)).toBe(true)
    expect(Option.getOrThrow(result).isUrgent).toBe(true)
    expect(Option.getOrThrow(result).text).toBe('Today')
  })

  it('marks isUrgent false when daysUntil is greater than 0', () => {
    const care: CareStatus = { daysUntil: 1, isOverdue: false }

    const result = getCareIndicator(care, 'water', mockT)

    expect(Option.isSome(result)).toBe(true)
    expect(Option.getOrThrow(result).isUrgent).toBe(false)
  })
})

describe('getCareIndicators', () => {
  describe('when no indicators are set', () => {
    it('returns empty array when both daysUntil are undefined', () => {
      const watering: CareStatus = { daysUntil: undefined, isOverdue: false }
      const fertilization: CareStatus = {
        daysUntil: undefined,
        isOverdue: false,
      }

      const result = getCareIndicators(watering, fertilization, mockT)

      expect(result).toEqual([])
    })
  })

  describe('overdue priority', () => {
    it('returns both overdue indicators when both are overdue', () => {
      const watering: CareStatus = { daysUntil: 0, isOverdue: true }
      const fertilization: CareStatus = { daysUntil: 0, isOverdue: true }

      const result = getCareIndicators(watering, fertilization, mockT)

      expect(result).toHaveLength(2)
      expect(result[0].isOverdue).toBe(true)
      expect(result[1].isOverdue).toBe(true)
    })

    it('returns only overdue indicator when one is overdue', () => {
      const watering: CareStatus = { daysUntil: 0, isOverdue: true }
      const fertilization: CareStatus = { daysUntil: 5, isOverdue: false }

      const result = getCareIndicators(watering, fertilization, mockT)

      expect(result).toHaveLength(1)
      expect(result[0].isOverdue).toBe(true)
      expect(result[0].type).toBe('water')
    })

    it('returns fertilize overdue when only fertilization is overdue', () => {
      const watering: CareStatus = { daysUntil: 3, isOverdue: false }
      const fertilization: CareStatus = { daysUntil: 0, isOverdue: true }

      const result = getCareIndicators(watering, fertilization, mockT)

      expect(result).toHaveLength(1)
      expect(result[0].isOverdue).toBe(true)
      expect(result[0].type).toBe('fertilize')
    })
  })

  describe('today priority', () => {
    it('returns both today indicators when both are due today', () => {
      const watering: CareStatus = { daysUntil: 0, isOverdue: false }
      const fertilization: CareStatus = { daysUntil: 0, isOverdue: false }

      const result = getCareIndicators(watering, fertilization, mockT)

      expect(result).toHaveLength(2)
      expect(result[0].isToday).toBe(true)
      expect(result[1].isToday).toBe(true)
    })

    it('returns only today indicator when one is due today', () => {
      const watering: CareStatus = { daysUntil: 0, isOverdue: false }
      const fertilization: CareStatus = { daysUntil: 5, isOverdue: false }

      const result = getCareIndicators(watering, fertilization, mockT)

      expect(result).toHaveLength(1)
      expect(result[0].isToday).toBe(true)
      expect(result[0].type).toBe('water')
    })

    it('returns fertilize today when only fertilization is due today', () => {
      const watering: CareStatus = { daysUntil: 3, isOverdue: false }
      const fertilization: CareStatus = { daysUntil: 0, isOverdue: false }

      const result = getCareIndicators(watering, fertilization, mockT)

      expect(result).toHaveLength(1)
      expect(result[0].isToday).toBe(true)
      expect(result[0].type).toBe('fertilize')
    })
  })

  describe('soonest priority', () => {
    it('returns water indicator when watering is sooner', () => {
      const watering: CareStatus = { daysUntil: 2, isOverdue: false }
      const fertilization: CareStatus = { daysUntil: 5, isOverdue: false }

      const result = getCareIndicators(watering, fertilization, mockT)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('water')
      expect(result[0].text).toBe('2 days')
    })

    it('returns fertilize indicator when fertilization is sooner', () => {
      const watering: CareStatus = { daysUntil: 5, isOverdue: false }
      const fertilization: CareStatus = { daysUntil: 1, isOverdue: false }

      const result = getCareIndicators(watering, fertilization, mockT)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('fertilize')
      expect(result[0].text).toBe('Tomorrow')
    })

    it('prefers water when both have same daysUntil', () => {
      const watering: CareStatus = { daysUntil: 3, isOverdue: false }
      const fertilization: CareStatus = { daysUntil: 3, isOverdue: false }

      const result = getCareIndicators(watering, fertilization, mockT)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('water')
    })
  })

  describe('single indicator scenarios', () => {
    it('returns water indicator when only watering has schedule', () => {
      const watering: CareStatus = { daysUntil: 3, isOverdue: false }
      const fertilization: CareStatus = {
        daysUntil: undefined,
        isOverdue: false,
      }

      const result = getCareIndicators(watering, fertilization, mockT)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('water')
    })

    it('returns fertilize indicator when only fertilization has schedule', () => {
      const watering: CareStatus = { daysUntil: undefined, isOverdue: false }
      const fertilization: CareStatus = { daysUntil: 5, isOverdue: false }

      const result = getCareIndicators(watering, fertilization, mockT)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('fertilize')
    })
  })

  describe('edge cases', () => {
    it('handles large daysUntil values', () => {
      const watering: CareStatus = { daysUntil: 365, isOverdue: false }
      const fertilization: CareStatus = { daysUntil: 180, isOverdue: false }

      const result = getCareIndicators(watering, fertilization, mockT)

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe('fertilize')
      expect(result[0].text).toBe('180 days')
    })

    it('overdue takes priority over today', () => {
      const watering: CareStatus = { daysUntil: 0, isOverdue: true }
      const fertilization: CareStatus = { daysUntil: 0, isOverdue: false }

      const result = getCareIndicators(watering, fertilization, mockT)

      expect(result).toHaveLength(1)
      expect(result[0].isOverdue).toBe(true)
    })
  })
})
