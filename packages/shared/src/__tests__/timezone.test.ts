import { Effect, Exit, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_NOTIFICATION_TIME,
  DEFAULT_TIMEZONE,
  InvalidTimeFormatError,
  InvalidTimezoneError,
  parseTime,
  TimeString,
  validateTimeFormat,
  validateTimezone,
} from '../domains/notification/timezone'

describe('Timezone Utilities', () => {
  describe('validateTimezone', () => {
    it('should accept valid IANA timezone - UTC', async () => {
      const result = await Effect.runPromise(validateTimezone('UTC'))

      expect(result).toBe('UTC')
    })

    it('should accept valid IANA timezone - America/New_York', async () => {
      const result = await Effect.runPromise(
        validateTimezone('America/New_York')
      )

      expect(result).toBe('America/New_York')
    })

    it('should accept valid IANA timezone - Europe/Paris', async () => {
      const result = await Effect.runPromise(validateTimezone('Europe/Paris'))

      expect(result).toBe('Europe/Paris')
    })

    it('should accept valid IANA timezone - Asia/Tokyo', async () => {
      const result = await Effect.runPromise(validateTimezone('Asia/Tokyo'))

      expect(result).toBe('Asia/Tokyo')
    })

    it('should accept valid IANA timezone - Pacific/Auckland', async () => {
      const result = await Effect.runPromise(
        validateTimezone('Pacific/Auckland')
      )

      expect(result).toBe('Pacific/Auckland')
    })

    it('should fail for invalid timezone', async () => {
      const result = await Effect.runPromiseExit(
        validateTimezone('Invalid/Timezone')
      )

      expect(Exit.isFailure(result)).toBe(true)
      if (Exit.isFailure(result)) {
        const error = result.cause
        expect(error._tag).toBe('Fail')
      }
    })

    it('should fail for empty string', async () => {
      const result = await Effect.runPromiseExit(validateTimezone(''))

      expect(Exit.isFailure(result)).toBe(true)
    })

    it('should return InvalidTimezoneError with correct timezone', async () => {
      const result = await Effect.runPromiseExit(
        validateTimezone('NotReal/Zone')
      )

      expect(Exit.isFailure(result)).toBe(true)
      if (Exit.isFailure(result)) {
        const cause = result.cause
        if (cause._tag === 'Fail') {
          const error = cause.error as InvalidTimezoneError
          expect(error._tag).toBe('InvalidTimezoneError')
          expect(error.timezone).toBe('NotReal/Zone')
        }
      }
    })
  })

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

      expect(Exit.isFailure(result)).toBe(true)
    })

    it('should fail for invalid minute - 60', async () => {
      const result = await Effect.runPromiseExit(validateTimeFormat('12:60'))

      expect(Exit.isFailure(result)).toBe(true)
    })

    it('should fail for single digit hour', async () => {
      const result = await Effect.runPromiseExit(validateTimeFormat('9:30'))

      expect(Exit.isFailure(result)).toBe(true)
    })

    it('should fail for single digit minute', async () => {
      const result = await Effect.runPromiseExit(validateTimeFormat('09:5'))

      expect(Exit.isFailure(result)).toBe(true)
    })

    it('should fail for 12-hour format with AM/PM', async () => {
      const result = await Effect.runPromiseExit(validateTimeFormat('9:30 AM'))

      expect(Exit.isFailure(result)).toBe(true)
    })

    it('should fail for empty string', async () => {
      const result = await Effect.runPromiseExit(validateTimeFormat(''))

      expect(Exit.isFailure(result)).toBe(true)
    })

    it('should fail for invalid separator', async () => {
      const result = await Effect.runPromiseExit(validateTimeFormat('09.30'))

      expect(Exit.isFailure(result)).toBe(true)
    })

    it('should fail for time with seconds', async () => {
      const result = await Effect.runPromiseExit(validateTimeFormat('09:30:00'))

      expect(Exit.isFailure(result)).toBe(true)
    })

    it('should return InvalidTimeFormatError with correct time', async () => {
      const result = await Effect.runPromiseExit(validateTimeFormat('invalid'))

      expect(Exit.isFailure(result)).toBe(true)
      if (Exit.isFailure(result)) {
        const cause = result.cause
        if (cause._tag === 'Fail') {
          const error = cause.error as InvalidTimeFormatError
          expect(error._tag).toBe('InvalidTimeFormatError')
          expect(error.time).toBe('invalid')
        }
      }
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

      expect(Exit.isFailure(result)).toBe(true)
    })

    it('should fail for out of range hours', async () => {
      const result = await Effect.runPromiseExit(parseTime('25:00'))

      expect(Exit.isFailure(result)).toBe(true)
    })

    it('should fail for out of range minutes', async () => {
      const result = await Effect.runPromiseExit(parseTime('12:61'))

      expect(Exit.isFailure(result)).toBe(true)
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

  describe('Default values', () => {
    it('should have correct default timezone', () => {
      expect(DEFAULT_TIMEZONE).toBe('UTC')
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

    it('default timezone should be valid', async () => {
      const result = await Effect.runPromise(validateTimezone(DEFAULT_TIMEZONE))

      expect(result).toBe('UTC')
    })
  })

  describe('Error classes', () => {
    it('InvalidTimezoneError should be a Schema.TaggedError', () => {
      const error = new InvalidTimezoneError({ timezone: 'Bad/Zone' })

      expect(error._tag).toBe('InvalidTimezoneError')
      expect(error.timezone).toBe('Bad/Zone')
    })

    it('InvalidTimeFormatError should be a Schema.TaggedError', () => {
      const error = new InvalidTimeFormatError({ time: 'bad-time' })

      expect(error._tag).toBe('InvalidTimeFormatError')
      expect(error.time).toBe('bad-time')
    })
  })
})
