import { failureOf } from '@lily/shared/testing'
import { Array, Effect, Option, Record, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { DEFAULT_ZONE, ZoneName } from '../domains/common/date/zone-name'
import {
  CANONICAL_TIME_ZONES,
  COUNTRY_TIME_ZONES,
  TIME_ZONE_ALIASES,
} from '../domains/notification/time-zones.generated'
import {
  DEFAULT_NOTIFICATION_TIME,
  InvalidTimeFormatError,
  parseTime,
  TimeString,
  validateTimeFormat,
} from '../domains/notification/timezone'

describe('Timezone Utilities', () => {
  describe('validateTimeFormat', () => {
    it('should accept valid time - midnight', async () => {
      const result = await Effect.runPromise(validateTimeFormat('00:00'))

      expect(result).toBe('00:00')
    })

    it('should accept valid time - noon', async () => {
      const result = await Effect.runPromise(validateTimeFormat('12:00'))

      expect(result).toBe('12:00')
    })

    it('should accept valid time - end of day', async () => {
      const result = await Effect.runPromise(validateTimeFormat('23:59'))

      expect(result).toBe('23:59')
    })

    it('should accept valid time - morning', async () => {
      const result = await Effect.runPromise(validateTimeFormat('09:30'))

      expect(result).toBe('09:30')
    })

    it('should fail for invalid hour - 24', async () => {
      const result = await Effect.runPromiseExit(validateTimeFormat('24:00'))

      expect(failureOf(result)._tag).toBe('InvalidTimeFormatError')
    })

    it('should fail for invalid minute - 60', async () => {
      const result = await Effect.runPromiseExit(validateTimeFormat('12:60'))

      expect(failureOf(result)._tag).toBe('InvalidTimeFormatError')
    })

    it('should fail for single digit hour', async () => {
      const result = await Effect.runPromiseExit(validateTimeFormat('9:30'))

      expect(failureOf(result)._tag).toBe('InvalidTimeFormatError')
    })

    it('should fail for single digit minute', async () => {
      const result = await Effect.runPromiseExit(validateTimeFormat('09:5'))

      expect(failureOf(result)._tag).toBe('InvalidTimeFormatError')
    })

    it('should fail for 12-hour format with AM/PM', async () => {
      const result = await Effect.runPromiseExit(validateTimeFormat('9:30 AM'))

      expect(failureOf(result)._tag).toBe('InvalidTimeFormatError')
    })

    it('should fail for empty string', async () => {
      const result = await Effect.runPromiseExit(validateTimeFormat(''))

      expect(failureOf(result)._tag).toBe('InvalidTimeFormatError')
    })

    it('should fail for invalid separator', async () => {
      const result = await Effect.runPromiseExit(validateTimeFormat('09.30'))

      expect(failureOf(result)._tag).toBe('InvalidTimeFormatError')
    })

    it('should fail for time with seconds', async () => {
      const result = await Effect.runPromiseExit(validateTimeFormat('09:30:00'))

      expect(failureOf(result)._tag).toBe('InvalidTimeFormatError')
    })

    it('should return InvalidTimeFormatError with correct time', async () => {
      const result = await Effect.runPromiseExit(validateTimeFormat('invalid'))

      const error = failureOf(result)
      expect(error).toBeInstanceOf(InvalidTimeFormatError)
      expect(error._tag).toBe('InvalidTimeFormatError')
      expect(error.time).toBe('invalid')
    })
  })

  describe('parseTime', () => {
    it('should parse valid time to hours and minutes', async () => {
      const result = await Effect.runPromise(parseTime('09:30'))

      expect(result.hours).toBe(9)
      expect(result.minutes).toBe(30)
    })

    it('should parse midnight correctly', async () => {
      const result = await Effect.runPromise(parseTime('00:00'))

      expect(result.hours).toBe(0)
      expect(result.minutes).toBe(0)
    })

    it('should parse end of day correctly', async () => {
      const result = await Effect.runPromise(parseTime('23:59'))

      expect(result.hours).toBe(23)
      expect(result.minutes).toBe(59)
    })

    it('should parse noon correctly', async () => {
      const result = await Effect.runPromise(parseTime('12:00'))

      expect(result.hours).toBe(12)
      expect(result.minutes).toBe(0)
    })

    it('should fail for invalid time format', async () => {
      const result = await Effect.runPromiseExit(parseTime('invalid'))

      expect(failureOf(result)._tag).toBe('InvalidTimeFormatError')
    })

    it('should fail for out of range hours', async () => {
      const result = await Effect.runPromiseExit(parseTime('25:00'))

      expect(failureOf(result)._tag).toBe('InvalidTimeFormatError')
    })

    it('should fail for out of range minutes', async () => {
      const result = await Effect.runPromiseExit(parseTime('12:61'))

      expect(failureOf(result)._tag).toBe('InvalidTimeFormatError')
    })
  })

  describe('TimeString Schema', () => {
    it('should accept valid time string', () => {
      const result = Schema.decodeSync(TimeString)('09:30')

      expect(result).toBe('09:30')
    })

    it('should accept midnight', () => {
      const result = Schema.decodeSync(TimeString)('00:00')

      expect(result).toBe('00:00')
    })

    it('should accept end of day', () => {
      const result = Schema.decodeSync(TimeString)('23:59')

      expect(result).toBe('23:59')
    })

    it('should reject invalid time format', () => {
      expect(() => Schema.decodeSync(TimeString)('9:30')).toThrow()
    })

    it('should reject 24:00', () => {
      expect(() => Schema.decodeSync(TimeString)('24:00')).toThrow()
    })

    it('should reject 12:60', () => {
      expect(() => Schema.decodeSync(TimeString)('12:60')).toThrow()
    })

    it('should reject empty string', () => {
      expect(() => Schema.decodeSync(TimeString)('')).toThrow()
    })

    it('should reject non-string values', () => {
      expect(() => Schema.decodeSync(TimeString)(930 as never)).toThrow()
    })
  })

  describe('ZoneName Schema', () => {
    const decode = Schema.decodeUnknownOption(ZoneName)

    it.each([
      ['Eire', 'Europe/Dublin'],
      ['Asia/Calcutta', 'Asia/Kolkata'],
      ['Europe/Kiev', 'Europe/Kyiv'],
      ['US/Pacific', 'America/Los_Angeles'],
      ['GMT', 'Etc/GMT'],
      ['Etc/UTC', 'UTC'],
    ])('decodes the alias %s to %s', (alias, zone) => {
      expect(decode(alias)).toEqual(Option.some(zone))
    })

    it.each([
      'UTC',
      'Europe/Paris',
      'America/Argentina/Buenos_Aires',
      'Europe/Zagreb',
      'Europe/Stockholm',
      'Atlantic/Reykjavik',
    ])('keeps the canonical zone %s', (zone) => {
      expect(decode(zone)).toEqual(Option.some(zone))
    })

    it('keeps every zone that zone.tab lists for a country', () => {
      expect(
        Array.filter(
          COUNTRY_TIME_ZONES,
          (zone) => !Option.exists(decode(zone), (decoded) => decoded === zone)
        )
      ).toEqual([])
    })

    it.each([
      ['europe/paris', 'Europe/Paris'],
      ['utc', 'UTC'],
      ['ASIA/CALCUTTA', 'Asia/Kolkata'],
      ['EST5EDT', 'America/New_York'],
      ['CST6CDT', 'America/Chicago'],
      ['MST7MDT', 'America/Denver'],
      ['PST8PDT', 'America/Los_Angeles'],
      ['pst8pdt', 'America/Los_Angeles'],
    ])('decodes %s to %s', (name, zone) => {
      expect(decode(name)).toEqual(Option.some(zone))
    })

    it('folds no two zone names to the same spelling', () => {
      const names = [...CANONICAL_TIME_ZONES, ...Record.keys(TIME_ZONE_ALIASES)]
      expect(new Set(Array.map(names, (name) => name.toLowerCase())).size).toBe(
        names.length
      )
    })

    it.each(['Not/AZone', '+05:00', 'GMT+05:00', 'toString', 'tostring', ''])(
      'rejects %j',
      (zone) => {
        expect(decode(zone)).toEqual(Option.none())
      }
    )

    it('rejects an alias on encode', () => {
      expect(Option.isNone(Schema.encodeUnknownOption(ZoneName)('Eire'))).toBe(
        true
      )
    })
  })

  describe('Default values', () => {
    it('should have correct default timezone', () => {
      expect(DEFAULT_ZONE).toBe('UTC')
    })

    it('should have correct default notification time', () => {
      expect(DEFAULT_NOTIFICATION_TIME).toBe('09:00')
    })

    it('default notification time should be valid', async () => {
      const result = await Effect.runPromise(
        validateTimeFormat(DEFAULT_NOTIFICATION_TIME)
      )

      expect(result).toBe('09:00')
    })
  })

  describe('Error classes', () => {
    it('InvalidTimeFormatError should be a Schema.TaggedError', () => {
      const error = new InvalidTimeFormatError({ time: 'bad-time' })

      expect(error._tag).toBe('InvalidTimeFormatError')
      expect(error.time).toBe('bad-time')
    })
  })
})
