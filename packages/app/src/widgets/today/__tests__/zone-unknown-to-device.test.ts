import type { CareTasksResponse } from '@lily/shared'
import { ZoneName } from '@lily/shared'
import * as Sentry from '@sentry/react-native'
import { Option } from 'effect'
import {
  buildTodayWidgetSnapshot,
  type TodayWidgetCopy,
} from '@/widgets/today/build-snapshot'
import { decideTodayWidgetInput } from '@/widgets/today/TodayWidgetSync'

const RealDateTimeFormat = Intl.DateTimeFormat

// Tzdata older than 2022g, set by a newer phone on the account.
const OLDER_PHONE_LACKS = 'America/Ciudad_Juarez'

const stubIntlWithout = (missing: string) => {
  // A declaration, because Effect constructs it with new.
  function DateTimeFormat(
    locales?: Intl.LocalesArgument,
    options?: Intl.DateTimeFormatOptions
  ) {
    if (options?.timeZone === missing) {
      throw new RangeError(`Invalid time zone specified: ${missing}`)
    }
    return new RealDateTimeFormat(locales, options)
  }
  return jest.spyOn(Intl, 'DateTimeFormat').mockImplementation(DateTimeFormat)
}

const tasks: CareTasksResponse = {
  overdue: [],
  today: [],
  upcoming: [],
  completedToday: 0,
  windowDays: ['2026-11-23'],
}

const copy: TodayWidgetCopy = {
  title: 'title',
  needsCare: (n) => `needs:${n}`,
  needsCareCaption: (n) => `caption:${n}`,
  morePlants: (n) => `more:${n}`,
  allDone: 'allDone',
  nextCareIn: (n) => `next:${n}`,
  nothingDue: 'nothingDue',
  careAction: (type) => `act:${type}`,
  daysLate: (n) => `late:${n}`,
  stale: 'stale',
  signedOut: 'signedOut',
}

describe('an account zone this phone does not know', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('builds the widget in UTC and reports the zone', () => {
    stubIntlWithout(OLDER_PHONE_LACKS)

    const snapshot = Option.flatMap(
      decideTodayWidgetInput({
        auth: {
          _tag: 'Authenticated',
          accessToken: 'token',
          user: {
            id: 'user-1',
            email: 'a@b.c',
            name: null,
            firstName: null,
            lastName: null,
            username: 'ada',
            timezone: ZoneName.make(OLDER_PHONE_LACKS),
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
            updatedAt: new Date('2026-01-01T00:00:00.000Z'),
            role: 'user',
            status: 'active',
          },
        },
        localizationReady: true,
        appActive: true,
        tasks: Option.some(tasks),
      }),
      (input) => buildTodayWidgetSnapshot(input, copy)
    )

    expect(Option.getOrThrow(snapshot)).toMatchObject({
      _tag: 'Ready',
      staleAt: Date.parse('2026-11-24T00:00:00.000Z'),
    })
    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      'zone.unknown_on_device',
      expect.objectContaining({ tags: { zone: OLDER_PHONE_LACKS } })
    )
  })
})
