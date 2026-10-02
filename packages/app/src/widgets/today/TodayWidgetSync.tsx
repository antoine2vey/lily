import type { CareTasksResponse } from '@lily/shared'
import * as Sentry from '@sentry/react-native'
import { Effect, Match, Option, pipe } from 'effect'
import { useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { type AuthState, useAuth } from '@/contexts/AuthContext'
import { useLocalizationContext } from '@/contexts/LocalizationContext'
import i18n from '@/i18n'
import { useEffectQuery } from '@/utils/client'
import {
  buildTodayWidgetSnapshot,
  makeTodayWidgetCopy,
  type TodayWidgetInput,
} from '@/widgets/today/build-snapshot'
import { encodeTodayWidgetSnapshot } from '@/widgets/today/snapshot'
import { writeTodayWidgetSnapshot } from '../../../modules/expo-live-activity-lily/src/widget'

export interface TodayWidgetAppState {
  readonly auth: AuthState
  readonly localizationReady: boolean
  readonly appActive: boolean
  readonly tasks: Option.Option<CareTasksResponse>
}

export const decideTodayWidgetInput = ({
  auth,
  localizationReady,
  appActive,
  tasks,
}: TodayWidgetAppState): Option.Option<TodayWidgetInput> =>
  Match.value(auth).pipe(
    Match.when(
      () => !localizationReady,
      () => Option.none()
    ),
    Match.tag('Loading', () => Option.none()),
    // A background launch on a locked device (Live Activity push-to-start)
    // can fail the keychain read and look signed out; never let that blank a
    // signed-in widget. A real logout is picked up at the next foreground.
    Match.tag('Unauthenticated', 'NeedsUsername', () =>
      appActive
        ? Option.some<TodayWidgetInput>({ _tag: 'SignedOut' })
        : Option.none()
    ),
    Match.tag('Authenticated', ({ user }) =>
      Option.map(
        tasks,
        (response): TodayWidgetInput => ({
          _tag: 'Ready',
          tasks: response,
          timezone: pipe(
            Option.fromNullishOr(user.timezone),
            Option.getOrElse(() => 'UTC')
          ),
        })
      )
    ),
    Match.exhaustive
  )

const useAppIsActive = (): boolean => {
  const [active, setActive] = useState(AppState.currentState === 'active')
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) =>
      setActive(next === 'active')
    )
    return () => subscription.remove()
  }, [])
  return active
}

// Mounted as a leaf beside the navigator so its re-renders never reach the
// tab bar.
export function TodayWidgetSync(): null {
  const { state } = useAuth()
  const { language, isLoading } = useLocalizationContext()
  const appActive = useAppIsActive()
  const { data } = useEffectQuery(
    'careTasks',
    'getCareTasks',
    {},
    { enabled: state._tag === 'Authenticated' }
  )
  const reportedUnavailable = useRef(false)

  useEffect(() => {
    pipe(
      decideTodayWidgetInput({
        auth: state,
        localizationReady: !isLoading,
        appActive,
        tasks: Option.fromNullishOr(data),
      }),
      Option.flatMap((input) =>
        buildTodayWidgetSnapshot(
          input,
          makeTodayWidgetCopy(i18n.getFixedT(language, 'care'))
        )
      ),
      Option.map((snapshot) =>
        Effect.runFork(
          pipe(
            writeTodayWidgetSnapshot(encodeTodayWidgetSnapshot(snapshot)),
            Effect.match({
              onFailure: (error) => {
                console.warn('[TodayWidget] snapshot write failed', error)
                Sentry.captureException(error)
              },
              onSuccess: (outcome) => {
                if (outcome === 'unavailable' && !reportedUnavailable.current) {
                  reportedUnavailable.current = true
                  console.info('[TodayWidget] no widget channel on this device')
                }
              },
            })
          )
        )
      )
    )
  }, [state, data, language, isLoading, appActive])

  return null
}
