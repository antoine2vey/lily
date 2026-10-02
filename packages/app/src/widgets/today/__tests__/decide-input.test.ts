import type { CareTasksResponse } from '@lily/shared'
import type { UserProfile } from '@lily/shared/auth'
import { Option } from 'effect'
import type { AuthState } from '@/contexts/AuthContext'
import {
  decideTodayWidgetInput,
  type TodayWidgetAppState,
} from '@/widgets/today/TodayWidgetSync'

const tasks: CareTasksResponse = {
  overdue: [],
  today: [],
  upcoming: [],
  completedToday: 0,
  windowDays: ['2026-03-26'],
}

const user = (timezone?: string): UserProfile => ({
  id: 'user-1',
  email: 'a@b.c',
  name: null,
  firstName: null,
  lastName: null,
  username: 'ada',
  ...(timezone === undefined ? {} : { timezone }),
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  role: 'user',
  status: 'active',
})

const authenticated = (timezone?: string): AuthState => ({
  _tag: 'Authenticated',
  user: user(timezone),
  accessToken: 'token',
})

const base: TodayWidgetAppState = {
  auth: authenticated('Europe/Paris'),
  localizationReady: true,
  appActive: true,
  tasks: Option.some(tasks),
}

const decide = (overrides: Partial<TodayWidgetAppState>) =>
  decideTodayWidgetInput({ ...base, ...overrides })

describe('decideTodayWidgetInput', () => {
  it('writes Ready with the profile timezone once tasks are loaded', () => {
    expect(decide({})).toStrictEqual(
      Option.some({ _tag: 'Ready', tasks, timezone: 'Europe/Paris' })
    )
  })

  it('falls back to UTC like the server when the profile has no timezone', () => {
    expect(decide({ auth: authenticated() })).toStrictEqual(
      Option.some({ _tag: 'Ready', tasks, timezone: 'UTC' })
    )
  })

  it('keeps the last snapshot while signed in but tasks are loading or failed', () => {
    expect(decide({ tasks: Option.none() })).toStrictEqual(Option.none())
  })

  it('keeps the last snapshot while auth is still resolving', () => {
    expect(decide({ auth: { _tag: 'Loading' } })).toStrictEqual(Option.none())
  })

  it('waits for the stored language so the widget never flashes English', () => {
    expect(decide({ localizationReady: false })).toStrictEqual(Option.none())
    expect(
      decide({ localizationReady: false, auth: { _tag: 'Unauthenticated' } })
    ).toStrictEqual(Option.none())
  })

  it('signs the widget out only while the app is in the foreground', () => {
    const signedOut = Option.some({ _tag: 'SignedOut' })
    const needsUsername: AuthState = {
      _tag: 'NeedsUsername',
      user: user(),
      accessToken: 'token',
    }

    expect(decide({ auth: { _tag: 'Unauthenticated' } })).toStrictEqual(
      signedOut
    )
    expect(decide({ auth: needsUsername })).toStrictEqual(signedOut)
    expect(
      decide({ auth: { _tag: 'Unauthenticated' }, appActive: false })
    ).toStrictEqual(Option.none())
    expect(decide({ auth: needsUsername, appActive: false })).toStrictEqual(
      Option.none()
    )
  })

  it('still refreshes a signed-in widget from a background launch', () => {
    expect(decide({ appActive: false })).toStrictEqual(
      Option.some({ _tag: 'Ready', tasks, timezone: 'Europe/Paris' })
    )
  })
})
