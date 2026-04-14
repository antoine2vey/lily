import type { LanguageCode } from '@lily/shared'
import type { UserProfile } from '@lily/shared/auth'
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
import * as RevenueCatService from '@/services/revenuecat'
import {
  apiEffectRunner,
  extractErrorField,
  extractErrorMessage,
  setOnAuthFailure,
} from '@/utils/client'
import {
  getDeviceLanguage,
  getDeviceTimezone,
  getExpoPushToken,
  getPlatform,
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
  ) => Promise<{ success: boolean; error?: string }>
  verifyMagicLink: (
    code: string
  ) => Promise<{ success: boolean; error?: string; status?: string }>
  setUsername: (
    username: string
  ) => Promise<{ success: boolean; error?: string }>
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
                  Schedule.whileInput((error: unknown) => {
                    const isAuthError =
                      error &&
                      typeof error === 'object' &&
                      '_tag' in error &&
                      (error._tag === 'UnauthorizedError' ||
                        error._tag === 'SessionNotFoundError')
                    return !isAuthError
                  })
                )
              ),
              Effect.catchAll(() =>
                Effect.gen(function* () {
                  yield* removeStoredAccessToken()
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
          router.replace('/(auth)/login')
        }
      }),
      Match.orElse(() => {})
    )
  }, [state, segments, router])

  const verifyMagicLink = useCallback(
    async (
      code: string
    ): Promise<{ success: boolean; error?: string; status?: string }> => {
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
    ): Promise<{ success: boolean; error?: string }> => {
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
    } catch {
      // Token might be invalid
      await Effect.runPromise(clearAuthStorage())
      setState({ _tag: 'Unauthenticated' })
    }
  }, [state])

  return (
    <AuthContext.Provider
      value={{
        state,
        pendingEmail,
        login,
        verifyMagicLink,
        setUsername,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
