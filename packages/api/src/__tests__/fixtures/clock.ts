import { afterAll, vi } from 'vitest'

/** A Sunday at 10:00 in Paris, 20:00 in Auckland. */
export const SUNDAY_10_IN_PARIS = new Date('2026-06-14T08:00:00.000Z')

/**
 * Stops `Date` at `now` for the rest of the test file. Call it before the
 * first fixture that reads the clock.
 */
export const freezeClock = (now: Date) => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(now)
  afterAll(() => {
    vi.useRealTimers()
  })
}
