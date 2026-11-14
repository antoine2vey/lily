import type { LanguageCode } from '@lily/shared'
import { act, renderHook } from '@testing-library/react-native'
import { Result } from 'effect'
import { AppState, type AppStateStatus } from 'react-native'

jest.mock('@/utils/client', () => ({ runApiEffect: jest.fn() }))
jest.mock('@/hooks/useSubscriptionSync', () => ({
  useSubscriptionSync: () => ({ syncSubscription: jest.fn() }),
}))
jest.mock('@/services/revenuecat', () => ({
  getCustomerInfo: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('@/hooks/useLocalization', () => ({ useLocalization: jest.fn() }))

import { useLocalization } from '@/hooks/useLocalization'
import { runApiEffect } from '@/utils/client'
import { useAppStateSync } from '../useAppStateSync'

const mockedRunApiEffect = runApiEffect as jest.Mock
const mockedUseLocalization = useLocalization as jest.Mock

const displayed = (language: LanguageCode, isLoading = false) =>
  mockedUseLocalization.mockReturnValue({ language, isLoading })

const requestIn = (language: LanguageCode) => [
  'aiChat',
  'requestChatFollowUps',
  { payload: { language } },
]

const listenToAppState = () => {
  const listeners: Array<(state: AppStateStatus) => void> = []
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    _type: string,
    listener: (state: AppStateStatus) => void
  ) => {
    listeners.push(listener)
    return { remove: jest.fn() }
  }) as typeof AppState.addEventListener)
  return async (...states: ReadonlyArray<AppStateStatus>) => {
    await act(async () => {
      for (const state of states) listeners.at(-1)?.(state)
    })
  }
}

describe('useAppStateSync follow-up requests', () => {
  beforeEach(() => {
    jest.restoreAllMocks()
    mockedRunApiEffect.mockReset()
    mockedRunApiEffect.mockResolvedValue(Result.succeed(undefined))
    displayed('en')
  })

  it('requests follow-ups in the displayed language when a signed-in session opens', () => {
    displayed('fr')
    renderHook(() => useAppStateSync(true))

    expect(mockedRunApiEffect.mock.calls).toEqual([requestIn('fr')])
  })

  it('requests nothing while signed out', async () => {
    const appBecomes = listenToAppState()
    renderHook(() => useAppStateSync(false))
    await appBecomes('background', 'active')

    expect(mockedRunApiEffect).not.toHaveBeenCalled()
  })

  it('waits for the stored language instead of asking in the default one', () => {
    displayed('en', true)
    const { rerender } = renderHook(() => useAppStateSync(true))
    expect(mockedRunApiEffect).not.toHaveBeenCalled()

    displayed('fr')
    rerender({})

    expect(mockedRunApiEffect.mock.calls).toEqual([requestIn('fr')])
  })

  it('requests follow-ups again when the app returns to the foreground', async () => {
    const appBecomes = listenToAppState()
    renderHook(() => useAppStateSync(true))
    await appBecomes('background', 'active')

    expect(mockedRunApiEffect.mock.calls).toEqual([
      requestIn('en'),
      requestIn('en'),
    ])
  })

  it('requests nothing when the app goes to the background', async () => {
    const appBecomes = listenToAppState()
    renderHook(() => useAppStateSync(true))
    await appBecomes('inactive', 'background')

    expect(mockedRunApiEffect.mock.calls).toEqual([requestIn('en')])
  })

  it('stays quiet when the request fails', async () => {
    mockedRunApiEffect.mockResolvedValue(
      Result.fail({ _tag: 'NetworkError', message: 'offline' })
    )
    const appBecomes = listenToAppState()

    expect(() => renderHook(() => useAppStateSync(true))).not.toThrow()
    await appBecomes('background', 'active')
    expect(mockedRunApiEffect).toHaveBeenCalledTimes(2)
  })
})
