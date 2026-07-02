import type { LanguageCode } from '@lily/shared'
import type { OAuthSignInRequest, UserProfile } from '@lily/shared/auth'
import { Duration, Effect, Match, Option, pipe, Schedule } from 'effect'
import { useRouter, useSegments } from 'expo-router'
import * as SecureStore from 'expo-secure-store'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import * as RevenueCatService from '@/services/revenuecat'
import {
  addAuthBreadcrumb,
  trackAuthAnomaly,
  trackForcedLogout,
} from '@/utils/auth-telemetry'
import {
  apiEffectRunner,
  extractErrorField,
  extractErrorMessage,
  isAuthFailureError,
  setOnAuthFailure,
} from '@/utils/client'
import {
  getDeviceLanguage,
  getDeviceTimezone,
  getExpoPushToken,
  getPlatform,
  reconcileLiveActivityTokens,
  registerLiveActivityTokens,
} from '@/utils/notifications'
import {
  clearAuthStorage,
  getStoredAccessToken,
  getStoredUserEmail,
  removeStoredAccessToken,
  storeAccessToken,
  storeRefreshToken,
  storeUserEmail,
} from '@/utils/storage'

const DEVICE_TOKEN_ID_KEY = 'lily_device_token_id'

/**
 * Register device for push notifications
 * Returns the token ID if successful
 */
async function registerDeviceForPush(): Promise<string | null> {
  try {
    const pushToken = await getExpoPushToken()
    if (!pushToken) {
      // Permission denied or revoked — clean up any stale token from the backend
      await unregisterDeviceFromPush()
      return null
    }

    const result = await apiEffectRunner(
      'deviceTokens',
      'registerDeviceToken',
      {
        payload: {
          token: pushToken,
          platform: getPlatform(),
        },
      }
    )

    // Store the token ID for later unregistration
    await SecureStore.setItemAsync(DEVICE_TOKEN_ID_KEY, result.id)

    // Wire up Live Activity push-to-start + per-activity token streams.
    // Listeners live for the rest of the process — iOS re-emits rotated
    // tokens through these subscriptions over the app's lifetime.
    await registerLiveActivityTokens(result.id)

    return result.id
  } catch (error) {
    console.error('Failed to register device token:', error)
    return null
  }
}

/**
 * Unregister device from push notifications
 */
async function unregisterDeviceFromPush(): Promise<void> {
  try {
    const tokenId = await SecureStore.getItemAsync(DEVICE_TOKEN_ID_KEY)
    if (tokenId) {
      await apiEffectRunner('deviceTokens', 'unregisterDeviceToken', {
        path: { tokenId },
      })
      await SecureStore.deleteItemAsync(DEVICE_TOKEN_ID_KEY)
    }
  } catch (error) {
    // Ignore errors during unregistration
    console.error('Failed to unregister device token:', error)
  }
}

// Auth state discriminated union
type AuthState =
  | { _tag: 'Loading' }
  | { _tag: 'Authenticated'; user: UserProfile; accessToken: string }
  | { _tag: 'Unauthenticated' }
  | { _tag: 'NeedsUsername'; user: UserProfile; accessToken: string }

type AuthContextValue = {
  state: AuthState
  pendingEmail: string | null
  login: (
    email: string,
    language?: LanguageCode
  ) => Promise<{
    success: boolean
    error?: string | undefined
    status?: string | undefined
  }>
  verifyMagicLink: (code: string) => Promise<{
    success: boolean
    error?: string | undefined
    status?: string | undefined
  }>
  setUsername: (
    username: string
  ) => Promise<{ success: boolean; error?: string | undefined }>
  signInWithOAuth: (
    input: Pick<OAuthSignInRequest, 'provider' | 'idToken' | 'fullName'>
  ) => Promise<{
    success: boolean
    error?: string | undefined
    status?: string | undefined
  }>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

type AuthProviderProps = {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>({ _tag: 'Loading' })
  const [pendingEmail, setPendingEmail] = useState<string | null>(null)
  const router = useRouter()
  const segments = useSegments() as string[]

  // Register auth failure callback for token refresh failures
  useEffect(() => {
    const handleAuthFailure = async () => {
      // The refresh path already captured the forced-logout event
      addAuthBreadcrumb('auth_failure_clearing_session')
      // Clear all auth storage
      await Effect.runPromise(clearAuthStorage())
      setPendingEmail(null)
      setState({ _tag: 'Unauthenticated' })
    }

    setOnAuthFailure(handleAuthFailure)

    return () => {
      setOnAuthFailure(null)
    }
  }, [])

  // Check for stored token on mount
  useEffect(() => {
    const checkAuth = Effect.gen(function* () {
      const tokenOption = yield* getStoredAccessToken()
      const emailOption = yield* getStoredUserEmail()

      pipe(
        emailOption,
        Option.match({
          onNone: () => {},
          onSome: (email) => setPendingEmail(email),
        })
      )

      yield* pipe(
        tokenOption,
        Option.match({
          onNone: () =>
            Effect.sync(() => {
              setState({ _tag: 'Unauthenticated' })
            }),
          onSome: (accessToken) =>
            Effect.tryPromise(() =>
              apiEffectRunner('auth', 'getCurrentUser', {})
            ).pipe(
              Effect.tap((user) =>
                Effect.sync(() => {
                  if (!user.username) {
                    setState({
                      _tag: 'NeedsUsername',
                      user,
                      accessToken,
                    })
                  } else {
                    setState({
                      _tag: 'Authenticated',
                      user,
                      accessToken,
                    })
                    registerDeviceForPush().catch((err) => {
                      console.warn(
                        'Push notification registration failed:',
                        err
                      )
                    })
                  }
                })
              ),
              Effect.retry(
                Schedule.intersect(
                  Schedule.recurs(2),
                  Schedule.spaced(Duration.millis(1500))
                ).pipe(
                  // Retry transient failures only — an auth error already
                  // went through token refresh inside runApiEffect, so
                  // retrying it would just rotate/burn refresh attempts
                  Schedule.whileInput(
                    (error: unknown) => !isAuthFailureError(error)
                  )
                )
              ),
              Effect.catchAll((error) =>
                Effect.gen(function* () {
                  if (isAuthFailureError(error)) {
                    trackForcedLogout('startup_check_auth_error')
                    yield* removeStoredAccessToken()
                  } else {
                    // Transient failure (e.g. no network right after
                    // launch) — keep tokens so the session can be restored
                    // instead of forcing a re-login
                    trackAuthAnomaly('startup_check_transient_failure', {
                      message: extractErrorMessage(error),
                    })
                  }
                  setState({ _tag: 'Unauthenticated' })
                })
              )
            ),
        })
      )
    }).pipe(
      Effect.catchAll(() =>
        Effect.sync(() => setState({ _tag: 'Unauthenticated' }))
      )
    )

    Effect.runPromise(checkAuth)
  }, [])

  // Handle navigation based on auth state
  useEffect(() => {
    if (state._tag === 'Loading') return

    const inAuthGroup = segments[0] === '(auth)'

    pipe(
      Match.value(state),
      Match.when({ _tag: 'Authenticated' }, () => {
        if (inAuthGroup && segments[1] !== 'onboarding') {
          router.replace('/')
        }
      }),
      Match.when({ _tag: 'NeedsUsername' }, () => {
        if (!inAuthGroup || segments[1] !== 'username') {
          router.replace('/(auth)/username')
        }
      }),
      Match.when({ _tag: 'Unauthenticated' }, () => {
        if (!inAuthGroup) {
          // Logging out from inside the app — go straight to login
          router.replace('/(auth)/login')
        } else {
          // In auth group on a stale screen (e.g. verify) — let index decide
          const validScreens = ['login', 'welcome', 'check-email']
          const currentSegment = segments[1] ?? ''
          if (!validScreens.includes(currentSegment)) {
            router.replace('/')
          }
        }
      }),
      Match.orElse(() => {})
    )
  }, [state, segments, router])

  // Re-reconcile Live Activity tokens whenever the app comes back to the
  // foreground. iOS may have created/ended activities via push while the
  // app was backgrounded and the in-process listeners were idle; this
  // catches them by re-reading `Activity.activities` synchronously. Also
  // handles the case where iOS rotated the push-to-start token behind our
  // back — the native module re-emits it on each foreground.
  // auth tag matters for scheduling this; state is read fresh via ref.
  useEffect(() => {
    if (state._tag !== 'Authenticated') return

    const prevState = { current: AppState.currentState as AppStateStatus }
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const transitioningToActive =
        prevState.current.match(/inactive|background/) && next === 'active'
      prevState.current = next
      if (!transitioningToActive) return
      void (async () => {
        const id = await SecureStore.getItemAsync(DEVICE_TOKEN_ID_KEY)
        if (id) await reconcileLiveActivityTokens(id)
      })()
    })
    return () => sub.remove()
  }, [state._tag])

  const verifyMagicLink = useCallback(
    async (
      code: string
    ): Promise<{
      success: boolean
      error?: string | undefined
      status?: string | undefined
    }> => {
      try {
        const response = await apiEffectRunner('auth', 'verifyMagicLink', {
          payload: {
            code,
            timezone: getDeviceTimezone(),
            language: getDeviceLanguage(),
          },
        })

        // Store both tokens
        await Effect.runPromise(storeAccessToken(response.accessToken))
        await Effect.runPromise(storeRefreshToken(response.refreshToken))

        if (!response.user.username) {
          setState({
            _tag: 'NeedsUsername',
            user: response.user,
            accessToken: response.accessToken,
          })
        } else {
          setState({
            _tag: 'Authenticated',
            user: response.user,
            accessToken: response.accessToken,
          })
          // Register device for push notifications after successful auth
          registerDeviceForPush().catch((err) => {
            console.warn('Push notification registration failed:', err)
          })
        }
        return { success: true }
      } catch (error) {
        return {
          success: false,
          error: extractErrorMessage(error),
          status: extractErrorField(error, 'status'),
        }
      }
    },
    []
  )

  const login = useCallback(
    async (
      email: string,
      language?: LanguageCode
    ): Promise<{
      success: boolean
      error?: string | undefined
      status?: string | undefined
    }> => {
      try {
        const response = await apiEffectRunner('auth', 'sendMagicLink', {
          payload: { email, language },
        })
        await Effect.runPromise(storeUserEmail(email))
        setPendingEmail(email)

        // Check for instant login (testing mode - used for TestFlight/App Review)
        if (response.instantCode) {
          return verifyMagicLink(response.instantCode)
        }

        return { success: true }
      } catch (error) {
        return {
          success: false,
          error: extractErrorMessage(error),
        }
      }
    },
    [verifyMagicLink]
  )

  const signInWithOAuth = useCallback(
    async (
      input: Pick<OAuthSignInRequest, 'provider' | 'idToken' | 'fullName'>
    ): Promise<{
      success: boolean
      error?: string | undefined
      status?: string | undefined
    }> => {
      try {
        const response = await apiEffectRunner('auth', 'oauthSignIn', {
          payload: {
            provider: input.provider,
            idToken: input.idToken,
            ...(input.fullName ? { fullName: input.fullName } : {}),
            timezone: getDeviceTimezone(),
            language: getDeviceLanguage(),
          },
        })

        await Effect.runPromise(storeAccessToken(response.accessToken))
        await Effect.runPromise(storeRefreshToken(response.refreshToken))
        await Effect.runPromise(storeUserEmail(response.user.email))
        setPendingEmail(response.user.email)

        if (!response.user.username) {
          setState({
            _tag: 'NeedsUsername',
            user: response.user,
            accessToken: response.accessToken,
          })
        } else {
          setState({
            _tag: 'Authenticated',
            user: response.user,
            accessToken: response.accessToken,
          })
          registerDeviceForPush().catch((err) => {
            console.warn('Push notification registration failed:', err)
          })
        }
        return { success: true }
      } catch (error) {
        return {
          success: false,
          error: extractErrorMessage(error),
          status: extractErrorField(error, 'status'),
        }
      }
    },
    []
  )

  const setUsername = useCallback(
    async (username: string): Promise<{ success: boolean; error?: string }> => {
      try {
        const user = await apiEffectRunner('auth', 'setUsername', {
          payload: { username },
        })
        if (state._tag === 'NeedsUsername' || state._tag === 'Authenticated') {
          setState({
            _tag: 'Authenticated',
            user,
            accessToken: state.accessToken,
          })
          // Register device for push notifications after completing username setup
          if (state._tag === 'NeedsUsername') {
            registerDeviceForPush().catch((err) => {
              console.warn('Push notification registration failed:', err)
            })
          }
        }
        return { success: true }
      } catch (error) {
        return {
          success: false,
          error: extractErrorMessage(error),
        }
      }
    },
    [state]
  )

  const logout = useCallback(async () => {
    // Unregister device from push notifications before logout
    await unregisterDeviceFromPush()

    // Clear RevenueCat identity
    try {
      await RevenueCatService.logout()
    } catch {
      // Ignore errors during RevenueCat logout
    }

    try {
      await apiEffectRunner('auth', 'logout', {})
    } catch {
      // Ignore errors, we'll clear local state anyway
    }
    await Effect.runPromise(clearAuthStorage())
    setPendingEmail(null)
    setState({ _tag: 'Unauthenticated' })
  }, [])

  const refreshUser = useCallback(async () => {
    if (state._tag !== 'Authenticated' && state._tag !== 'NeedsUsername') {
      return
    }
    try {
      const user = await apiEffectRunner('auth', 'getCurrentUser', {})
      if (!user.username) {
        setState({
          _tag: 'NeedsUsername',
          user,
          accessToken: state.accessToken,
        })
      } else {
        setState({
          _tag: 'Authenticated',
          user,
          accessToken: state.accessToken,
        })
      }
    } catch (error) {
      if (isAuthFailureError(error)) {
        // Token is invalid and refresh could not recover it
        trackForcedLogout('refresh_user_auth_error')
        await Effect.runPromise(clearAuthStorage())
        setState({ _tag: 'Unauthenticated' })
      } else {
        // Transient failure (network, server) — keep the session, the
        // profile will refresh on the next call
        addAuthBreadcrumb('refresh_user_transient_failure', {
          message: extractErrorMessage(error),
        })
      }
    }
  }, [state])

  return (
    <AuthContext.Provider
      value={{
        state,
        pendingEmail,
        login,
        verifyMagicLink,
        signInWithOAuth,
        setUsername,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
