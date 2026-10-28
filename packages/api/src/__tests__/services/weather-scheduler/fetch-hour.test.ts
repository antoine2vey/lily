import { isWeatherFetchHour } from '@lily/api/services/weather-scheduler/scheduler'
import { DateTime } from 'effect'
import { describe, expect, it } from 'vitest'

// 13:00 UTC: 06:00 in Etc/GMT+7 (UTC-7), 02:00 in Auckland (UTC+13), 13:00 in UTC.
const at13Utc = DateTime.makeUnsafe('2026-10-27T13:00:00.000Z')

describe('isWeatherFetchHour', () => {
  it('reads the hour on the wall clock of the given zone, not in UTC', () => {
    expect(isWeatherFetchHour(at13Utc, 'Etc/GMT+7')).toBe(true)
    expect(isWeatherFetchHour(at13Utc, 'Pacific/Auckland')).toBe(false)
    expect(isWeatherFetchHour(at13Utc, 'UTC')).toBe(false)
  })

  it('treats an unknown zone as UTC', () => {
    const at6Utc = DateTime.makeUnsafe('2026-10-27T06:00:00.000Z')
    expect(isWeatherFetchHour(at6Utc, 'Not/AZone')).toBe(true)
    expect(isWeatherFetchHour(at13Utc, 'Not/AZone')).toBe(false)
  })
})
