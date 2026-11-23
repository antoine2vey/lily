// Fixture for lint/no-instant-day-math.grit. scripts/test-lint-rules.sh checks
// that the rule flags exactly the lines that end in `// flag`.
import { DateTime, Duration, pipe } from 'effect'

declare const now: DateTime.Utc
declare const today: Date
declare const d: Date
declare const days: number
declare const i: number
declare const x: number
declare const opts: { days: number }
declare const localDayKey: (dt: DateTime.DateTime, tz: string) => string

export const flagged = [
  86400000, // flag
  86_400_000, // flag
  864e5, // flag
  8.64e7, // flag
  86400e3, // flag
  24 * 60 * 60 * 1000, // flag
  1000 * 60 * 60 * 24, // flag
  60 * 60 * 24 * 1000, // flag
  60 * 1000 * 24 * 60, // flag
  86400 * 1000, // flag
  1000 * 86_400, // flag
  24 * 3600 * 1000, // flag
  3600 * 1000 * 24, // flag
  24 * 3_600_000, // flag
  3600000 * 24, // flag
  24 * 60 * 60_000, // flag
  1440 * 60 * 1000, // flag
  1440 * 60_000, // flag
  30 * 24 * 60 * 60 * 1000, // flag
  days * 86_400 * 1000, // flag
  24 * 60 * 60 * 1000 * 7, // flag
  x / (1000 * 60 * 60 * 24), // flag
  new Date(today.getTime() + 86400000), // flag
  DateTime.add(now, { days: i }), // flag
  DateTime.subtract(now, { hours: 1, weeks: 2 }), // flag
  DateTime.add(now, { months: 1 }), // flag
  DateTime.add(now, { 'days': 1 }), // flag
  pipe(now, DateTime.add({ days })), // flag
]

export const clean = [
  d.getTime() + 500,
  d.getTime() - today.getTime(),
  24 * 60 * 60,
  60 * 60 * 1000,
  24 * 60 * 1000,
  124 * 60 * 60 * 1000,
  24 * 60 * 60 * 10000,
  3600000,
  DateTime.add(now, { hours: 1 }),
  DateTime.add(now, { holidays: 1 }),
  DateTime.addDuration(now, Duration.days(1)),
]

// Known misses. The rule matches text, not values, so these pass unflagged.
// The test holds them clean, so catching one means moving it up to flagged.
// A parenthesized partial product: (24 * 60 * 60) * 1000.
// A factor spelled 1e3: 24 * 60 * 60 * 1e3.
// A multiple of a day folded into one factor: 48 * 60 * 60 * 1000.
// An options object built elsewhere: DateTime.add(now, opts).
// A day read back from a Duration: localDayKey(DateTime.addDuration(now, Duration.days(i)), tz).
export const knownMisses = [
  (24 * 60 * 60) * 1000,
  24 * 60 * 60 * 1e3,
  48 * 60 * 60 * 1000,
  DateTime.add(now, opts),
  localDayKey(DateTime.addDuration(now, Duration.days(i)), 'UTC'),
]
