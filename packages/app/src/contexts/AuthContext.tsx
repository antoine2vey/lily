import type { UserProfile } from '@lily/shared/auth'
import { Effect, Match, Option, pipe } from 'effect'
import { useRouter, useSegments } from 'expo-router'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'
import { apiEffectRunner } from 'src/utils/client'
import {
  clearAuthStorage,
  getStoredAccessToken,
  getStoredUserEmail,
  removeStoredAccessToken,
  storeAccessToken,
  storeRefreshToken,
  storeUserEmail,
} from 'src/utils/storage'

// Auth state discriminated union
type AuthState =
  | { _tag: 'Loading' }
  | { _tag: 'Authenticated'; user: UserProfile; accessToken: string }
  | { _tag: 'Unauthenticated' }
  | { _tag: 'NeedsUsername'; user: UserProfile; accessToken: string }

type AuthContextValue = {
  state: AuthState
  pendingEmail: string | null
  login: (email: string) => Promise<{ success: boolean; error?: string }>
  verifyMagicLink: (
    code: string
  ) => Promise<{ success: boolean; error?: string }>
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
  const segments = useSegments()

  // Check for stored token on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const tokenOption = await Effect.runPromise(getStoredAccessToken())
        const emailOption = await Effect.runPromise(getStoredUserEmail())

        // Set pending email if stored
        pipe(
          emailOption,
          Option.match({
            onNone: () => {},
            onSome: (email) => setPendingEmail(email),
          })
        )

        await pipe(
          tokenOption,
          Option.match({
            onNone: async () => {
              setState({ _tag: 'Unauthenticated' })
            },
            onSome: async (accessToken) => {
              try {
                const user = await apiEffectRunner('auth', 'getCurrentUser', {})
                if (!user.username) {
                  setState({ _tag: 'NeedsUsername', user, accessToken })
                } else {
                  setState({ _tag: 'Authenticated', user, accessToken })
                }
              } catch {
                // Token is invalid, clear storage
                await Effect.runPromise(removeStoredAccessToken())
                setState({ _tag: 'Unauthenticated' })
              }
            },
          })
        )
      } catch {
        setState({ _tag: 'Unauthenticated' })
      }
    }

    checkAuth()
  }, [])

  // Handle navigation based on auth state
  useEffect(() => {
    if (state._tag === 'Loading') return

    const inAuthGroup = segments[0] === '(auth)'

    pipe(
      Match.value(state),
      Match.when({ _tag: 'Authenticated' }, () => {
        if (inAuthGroup) {
          router.replace('/(app)')
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

  const login = useCallback(
    async (email: string): Promise<{ success: boolean; error?: string }> => {
      try {
        await apiEffectRunner('auth', 'sendMagicLink', {
          payload: { email },
        })
        await Effect.runPromise(storeUserEmail(email))
        setPendingEmail(email)
        return { success: true }
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to send magic link',
        }
      }
    },
    []
  )

  const verifyMagicLink = useCallback(
    async (code: string): Promise<{ success: boolean; error?: string }> => {
      try {
        const response = await apiEffectRunner('auth', 'verifyMagicLink', {
          payload: { code },
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
        }
        return { success: true }
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to verify magic link',
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
        }
        return { success: true }
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error ? error.message : 'Failed to set username',
        }
      }
    },
    [state]
  )

  const logout = useCallback(async () => {
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
