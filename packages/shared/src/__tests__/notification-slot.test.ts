import {
  Array,
  DateTime,
  Effect,
  String as EffectString,
  Exit,
  Option,
  pipe,
} from 'effect'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { localDayKey, withTimeZone, ZoneName } from '../domains/common/date'
import {
  pickNotificationTime,
  pickUpcomingNotificationTime,
  type SlotRecipient,
} from '../domains/notification/overdue'
import { isInDndWindow, timeToMinutes } from '../domains/notification/timezone'
import { failureOf } from '../testing/exit'

type Dnd = readonly [start: string, end: string]

const UTC = ZoneName.make('UTC')
const PARIS = ZoneName.make('Europe/Paris')
const NEW_YORK = ZoneName.make('America/New_York')

const SEND_WINDOWS = [
  { start: 6 * 60, end: 8 * 60 },
  { start: 18 * 60, end: 22 * 60 },
]

const ROLLS = Array.makeBy(100, (i) => i / 100)

const recipientWith = (
  timezone: ZoneName,
  [doNotDisturbStart, doNotDisturbEnd]: Dnd | readonly [null, null]
): SlotRecipient => ({
  id: 'user',
  timezone,
  doNotDisturb: true,
  doNotDisturbStart,
  doNotDisturbEnd,
})

const minuteOfDay = (local: DateTime.Zoned): number => {
  const { hour, minute } = DateTime.toParts(local)
  return hour * 60 + minute
}

const nowIn = (timezone: ZoneName): DateTime.Zoned =>
  withTimeZone(DateTime.nowUnsafe(), timezone)

/** The rules `slot` breaks, read on the recipient's local clock. */
const faultsOf =
  (timezone: ZoneName, [start, end]: Dnd) =>
  (slot: Date): ReadonlyArray<string> => {
    const local = withTimeZone(DateTime.makeUnsafe(slot), timezone)
    const minute = minuteOfDay(local)
    return pipe(
      [
        [
          isInDndWindow(minute, timeToMinutes(start), timeToMinutes(end)),
          `is inside do-not-disturb ${start}-${end}`,
        ],
        [
          !Array.some(SEND_WINDOWS, (w) => minute >= w.start && minute < w.end),
          'is outside both send windows',
        ],
        [
          localDayKey(local, timezone) !==
            localDayKey(DateTime.nowUnsafe(), timezone),
          'is not on the local day',
        ],
      ] as const,
      Array.filter(([broken]) => broken),
      Array.map(([, rule]) => `${DateTime.formatIsoZoned(local)} ${rule}`)
    )
  }

const slotsToday = (recipient: SlotRecipient): ReadonlyArray<Date> =>
  Array.map(ROLLS, (roll) =>
    Effect.runSync(pickNotificationTime(recipient, roll))
  )

const upcomingSlots = (
  recipient: SlotRecipient
): ReadonlyArray<Option.Option<Date>> =>
  Array.map(ROLLS, (roll) =>
    Effect.runSync(pickUpcomingNotificationTime(recipient, roll))
  )

const PARTIAL_RANGES: ReadonlyArray<readonly [...Dnd, string]> = [
  ['22:00', '07:00', 'crosses midnight into the morning window'],
  ['21:00', '06:30', 'crosses midnight and overlaps both windows'],
  ['05:00', '06:30', 'covers the start of the morning window'],
  ['07:30', '09:00', 'covers the end of the morning window'],
  ['17:00', '19:00', 'covers the start of the evening window'],
  ['21:00', '23:00', 'covers the end of the evening window'],
  ['07:30', '18:30', 'covers the end of one window and the start of the next'],
  ['06:30', '07:30', 'sits inside the morning window'],
  ['19:00', '21:00', 'sits inside the evening window'],
]

describe('send slots and do-not-disturb', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  describe('pickNotificationTime', () => {
    it.each(PARTIAL_RANGES)(
      'picks no minute inside a do-not-disturb of %s-%s, which %s',
      (start, end) => {
        vi.setSystemTime(new Date('2026-11-16T10:00:00.000Z'))
        const dnd = [start, end] as const

        expect(
          Array.flatMap(slotsToday(recipientWith(UTC, dnd)), faultsOf(UTC, dnd))
        ).toEqual([])
      }
    )

    it('spreads the roll over both parts of a window that do-not-disturb splits', () => {
      vi.setSystemTime(new Date('2026-11-16T10:00:00.000Z'))
      const recipient = recipientWith(UTC, ['19:00', '21:00'])

      expect(
        Array.map([0.5, 0.74, 0.75, 0.99], (roll) =>
          Effect.runSync(pickNotificationTime(recipient, roll)).toISOString()
        )
      ).toEqual([
        '2026-11-16T18:00:00.000Z',
        '2026-11-16T18:57:00.000Z',
        '2026-11-16T21:00:00.000Z',
        '2026-11-16T21:57:00.000Z',
      ])
    })

    it('fails with DndWindowBlockedError when do-not-disturb covers both windows', () => {
      vi.setSystemTime(new Date('2026-11-16T10:00:00.000Z'))
      const recipient = recipientWith(UTC, ['05:00', '23:00'])

      expect(
        Array.dedupe(
          Array.map(
            ROLLS,
            (roll) =>
              failureOf(
                Effect.runSyncExit(pickNotificationTime(recipient, roll))
              )._tag
          )
        )
      ).toEqual(['DndWindowBlockedError'])
    })
  })

  describe('pickUpcomingNotificationTime', () => {
    it.each(PARTIAL_RANGES)(
      'picks no minute inside a do-not-disturb of %s-%s, which %s',
      (start, end) => {
        vi.setSystemTime(new Date('2026-11-16T06:10:00.000Z'))
        const dnd = [start, end] as const
        const slots = Array.getSomes(upcomingSlots(recipientWith(UTC, dnd)))

        expect(Array.flatMap(slots, faultsOf(UTC, dnd))).toEqual([])
        expect(
          Array.filter(slots, (slot) => slot.getTime() <= Date.now())
        ).toEqual([])
      }
    )

    it('waits for the default do-not-disturb to end at 07:00 when it is 06:10', () => {
      vi.setSystemTime(new Date('2026-11-16T06:10:00.000Z'))
      const recipient = recipientWith(UTC, [null, null])

      expect(
        Effect.runSync(pickUpcomingNotificationTime(recipient, 0))
      ).toEqual(Option.some(new Date('2026-11-16T07:00:00.000Z')))
      expect(
        Array.flatMap(
          Array.getSomes(upcomingSlots(recipient)),
          faultsOf(UTC, ['22:00', '07:00'])
        )
      ).toEqual([])
    })

    it('has no slot left once the open minutes of today are over', () => {
      vi.setSystemTime(new Date('2026-11-16T21:30:00.000Z'))
      const recipient = recipientWith(UTC, ['21:00', '06:30'])

      expect(Array.dedupe(upcomingSlots(recipient))).toEqual([Option.none()])
    })

    it('fails with DndWindowBlockedError when do-not-disturb covers both windows', () => {
      vi.setSystemTime(new Date('2026-11-16T06:10:00.000Z'))
      const recipient = recipientWith(UTC, ['05:00', '23:00'])

      expect(
        Array.dedupe(
          Array.map(
            ROLLS,
            (roll) =>
              failureOf(
                Effect.runSyncExit(
                  pickUpcomingNotificationTime(recipient, roll)
                )
              )._tag
          )
        )
      ).toEqual(['DndWindowBlockedError'])
    })
  })

  describe('with a stored bound that is not HH:mm', () => {
    const MALFORMED: ReadonlyArray<readonly [...Dnd, ...Dnd]> = [
      ['', '07:00', '22:00', '07:00'],
      ['22:00', '', '22:00', '07:00'],
      ['garbage', '06:30', '22:00', '06:30'],
      ['21:00', 'garbage', '21:00', '07:00'],
      ['', '', '22:00', '07:00'],
      ['garbage', 'garbage', '22:00', '07:00'],
    ]

    const outcomeOf = <A>(
      exit: Exit.Exit<A, { readonly _tag: string }>,
      show: (picked: A) => string
    ): string =>
      Exit.isSuccess(exit) ? show(exit.value) : failureOf(exit)._tag

    const picksToday = (recipient: SlotRecipient): ReadonlyArray<string> =>
      Array.map(ROLLS, (roll) =>
        outcomeOf(
          Effect.runSyncExit(pickNotificationTime(recipient, roll)),
          (slot) => slot.toISOString()
        )
      )

    const picksUpcoming = (recipient: SlotRecipient): ReadonlyArray<string> =>
      Array.map(ROLLS, (roll) =>
        outcomeOf(
          Effect.runSyncExit(pickUpcomingNotificationTime(recipient, roll)),
          Option.match({
            onNone: () => 'none',
            onSome: (slot) => slot.toISOString(),
          })
        )
      )

    it.each(MALFORMED)(
      'pickNotificationTime reads %j-%j as %s-%s',
      (start, end, readStart, readEnd) => {
        vi.setSystemTime(new Date('2026-11-16T03:00:00.000Z'))

        expect(picksToday(recipientWith(UTC, [start, end]))).toEqual(
          picksToday(recipientWith(UTC, [readStart, readEnd]))
        )
      }
    )

    it.each(MALFORMED)(
      'pickUpcomingNotificationTime reads %j-%j as %s-%s',
      (start, end, readStart, readEnd) => {
        vi.setSystemTime(new Date('2026-11-16T03:00:00.000Z'))

        expect(picksUpcoming(recipientWith(UTC, [start, end]))).toEqual(
          picksUpcoming(recipientWith(UTC, [readStart, readEnd]))
        )
      }
    )
  })

  describe('on the day of a clock change', () => {
    it.each([
      [PARIS, 'springs forward', '2026-03-29T04:10:00.000Z', '05:00'],
      [PARIS, 'falls back', '2026-10-25T05:10:00.000Z', '06:00'],
      [NEW_YORK, 'springs forward', '2026-03-08T10:10:00.000Z', '11:00'],
      [NEW_YORK, 'falls back', '2026-11-01T11:10:00.000Z', '12:00'],
    ] as const)(
      'keeps slots out of a 22:00-07:00 do-not-disturb when %s %s',
      (timezone, _change, sixTenLocal, sevenLocalInUtc) => {
        vi.setSystemTime(new Date(sixTenLocal))
        const dnd = ['22:00', '07:00'] as const
        const recipient = recipientWith(timezone, dnd)
        const day = localDayKey(DateTime.nowUnsafe(), timezone)

        expect(
          Array.flatMap(slotsToday(recipient), faultsOf(timezone, dnd))
        ).toEqual([])
        expect(
          Array.flatMap(
            Array.getSomes(upcomingSlots(recipient)),
            faultsOf(timezone, dnd)
          )
        ).toEqual([])
        expect(
          Effect.runSync(pickUpcomingNotificationTime(recipient, 0))
        ).toEqual(Option.some(new Date(`${day}T${sevenLocalInUtc}:00.000Z`)))
      }
    )
  })

  describe('for every do-not-disturb range on a 45-minute grid', () => {
    const BOUNDS = Array.makeBy(32, (i) =>
      pipe(
        [Math.floor((i * 45) / 60), (i * 45) % 60],
        Array.map((part) => pipe(`${part}`, EffectString.padStart(2, '0'))),
        Array.join(':')
      )
    )
    const RANGES: ReadonlyArray<Dnd> = Array.cartesian(BOUNDS, BOUNDS)
    const SWEEP_ROLLS = [0, 0.13, 0.31, 0.49, 0.5, 0.68, 0.86, 0.99]

    const openMinutes = ([start, end]: Dnd): ReadonlyArray<number> => {
      const dndStart = timeToMinutes(start)
      const dndEnd = timeToMinutes(end)
      return Array.flatMap(SEND_WINDOWS, (w) =>
        Array.filter(
          Array.range(w.start, w.end - 1),
          (minute) => !isInDndWindow(minute, dndStart, dndEnd)
        )
      )
    }

    const blockedOr =
      (dnd: Dnd, open: ReadonlyArray<number>, roll: number) =>
      <A>(
        exit: Exit.Exit<A, { readonly _tag: string }>,
        faultsOfPick: (picked: A) => ReadonlyArray<string>
      ): ReadonlyArray<string> => {
        const at = `do-not-disturb ${dnd[0]}-${dnd[1]}, roll ${roll}:`
        const blocked = Array.isReadonlyArrayEmpty(open)
        if (Exit.isSuccess(exit)) {
          return blocked
            ? [`${at} picked a slot with no open minute`]
            : Array.map(faultsOfPick(exit.value), (fault) => `${at} ${fault}`)
        }
        return blocked && failureOf(exit)._tag === 'DndWindowBlockedError'
          ? []
          : [`${at} failed with open minutes left`]
      }

    it('pickNotificationTime picks an open minute, or fails when there is none', () => {
      vi.setSystemTime(new Date('2026-11-16T10:00:00.000Z'))

      const faults = Array.flatMap(RANGES, (dnd) => {
        const open = openMinutes(dnd)
        return Array.flatMap(SWEEP_ROLLS, (roll) =>
          blockedOr(
            dnd,
            open,
            roll
          )(
            Effect.runSyncExit(
              pickNotificationTime(recipientWith(UTC, dnd), roll)
            ),
            faultsOf(UTC, dnd)
          )
        )
      })

      expect(Array.take(faults, 5)).toEqual([])
    })

    it.each([
      ['06:10', '2026-11-16T06:10:00.000Z'],
      ['19:30', '2026-11-16T19:30:00.000Z'],
    ])(
      'pickUpcomingNotificationTime at %s picks an open minute after now, or none when none is left',
      (_local, instant) => {
        vi.setSystemTime(new Date(instant))
        const nowMinute = minuteOfDay(nowIn(UTC))

        const faults = Array.flatMap(RANGES, (dnd) => {
          const open = openMinutes(dnd)
          const left = Array.some(open, (minute) => minute > nowMinute)
          return Array.flatMap(SWEEP_ROLLS, (roll) =>
            blockedOr(
              dnd,
              open,
              roll
            )(
              Effect.runSyncExit(
                pickUpcomingNotificationTime(recipientWith(UTC, dnd), roll)
              ),
              Option.match({
                onNone: () => (left ? ['skipped the open minutes left'] : []),
                onSome: (slot) => [
                  ...faultsOf(UTC, dnd)(slot),
                  ...(slot.getTime() > Date.now() ? [] : ['is not after now']),
                ],
              })
            )
          )
        })

        expect(Array.take(faults, 5)).toEqual([])
      }
    )
  })
})
