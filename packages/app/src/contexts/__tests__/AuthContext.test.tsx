import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import { Result } from 'effect'
import type React from 'react'
import { mockUserSettings } from '@/__tests__/fixtures'
import { USER_SETTINGS_QUERY_KEY } from '@/utils/query-keys'
import { AuthProvider, useAuth } from '../AuthContext'

const mockReplace = jest.fn()
let mockSegments: string[] = ['(app)']
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: mockReplace,
    back: jest.fn(),
  }),
  useSegments: () => mockSegments,
}))

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/utils/storage', () => {
  const { Effect, Option } = require('effect')
  return {
    clearAuthStorage: Effect.void,
    getStoredAccessToken: Effect.suspend(() => mockGetStoredAccessToken()),
    getStoredUserEmail: Effect.succeed(Option.none()),
    getStoredUserProfile: Effect.suspend(() => mockGetStoredUserProfile()),
    removeStoredAccessToken: Effect.suspend(() =>
      mockRemoveStoredAccessToken()
    ),
    removeStoredUserProfile: Effect.void,
    storeAccessToken: jest.fn().mockReturnValue(Effect.void),
    storeRefreshToken: jest.fn().mockReturnValue(Effect.void),
    storeUserEmail: jest.fn().mockReturnValue(Effect.void),
    storeUserProfile: jest.fn().mockReturnValue(Effect.void),
  }
})

const { Effect, Option } = require('effect')
const mockGetStoredAccessToken = jest
  .fn()
  .mockReturnValue(Effect.succeed(Option.none()))
const mockGetStoredUserProfile = jest
  .fn()
  .mockReturnValue(Effect.succeed(Option.none()))
const mockRemoveStoredAccessToken = jest.fn().mockReturnValue(Effect.void)

jest.mock('@/utils/client', () => ({
  apiEffectRunner: jest.fn(),
  extractErrorMessage: jest.fn((error: unknown) =>
    error instanceof Error ? error.message : String(error)
  ),
  extractErrorField: jest.fn(),
  isAuthFailureError: jest.fn().mockReturnValue(false),
  setOnAuthFailure: jest.fn(),
}))

// Mock auth telemetry (calls into Sentry)
jest.mock('@/utils/auth-telemetry', () => ({
  addAuthBreadcrumb: jest.fn(),
  trackAuthAnomaly: jest.fn(),
  trackForcedLogout: jest.fn(),
}))

jest.mock('@/utils/notifications', () => ({
  getDeviceLanguage: jest.fn().mockReturnValue('en'),
  getDeviceTimezone: jest.fn().mockReturnValue('UTC'),
  getExpoPushToken: jest.fn().mockResolvedValue('mock-push-token'),
  getPlatform: jest.fn().mockReturnValue('ios'),
  reconcileLiveActivityTokens: jest.fn().mockResolvedValue(undefined),
  registerLiveActivityTokens: jest.fn().mockResolvedValue(() => {}),
}))

const makeQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { gcTime: Number.POSITIVE_INFINITY } },
  })

const wrapperWith =
  (queryClient: QueryClient) =>
  ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  )

const wrapper = ({ children }: { children: React.ReactNode }) =>
  wrapperWith(makeQueryClient())({ children })

describe('AuthContext', () => {
  describe('useAuth hook', () => {
    it('throws when used outside provider', () => {
      expect(() => {
        renderHook(() => useAuth())
      }).toThrow('useAuth must be used within an AuthProvider')
    })
  })

  describe('AuthProvider', () => {
    it('transitions from Loading to Unauthenticated', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.state._tag).toBe('Unauthenticated')
      })
    })
  })

  describe('login', () => {
    afterEach(() => {
      require('@/utils/client').apiEffectRunner.mockReset()
    })

    it('sends the magic link and keeps the email for the check-email screen', async () => {
      const { apiEffectRunner } = require('@/utils/client')
      const { storeUserEmail } = require('@/utils/storage')
      apiEffectRunner.mockResolvedValue({})
      const { result } = renderHook(() => useAuth(), { wrapper })
      await waitFor(() => {
        expect(result.current.state._tag).toBe('Unauthenticated')
      })

      await act(() => result.current.login('ada@example.com', 'en'))

      expect(apiEffectRunner).toHaveBeenCalledWith('auth', 'sendMagicLink', {
        payload: { email: 'ada@example.com', language: 'en' },
      })
      expect(storeUserEmail).toHaveBeenCalledWith('ada@example.com')
      expect(result.current.pendingEmail).toBe('ada@example.com')
      expect(result.current.state._tag).toBe('Unauthenticated')
    })
  })

  describe('startup with stored token', () => {
    const cachedUser = {
      id: 'user-1',
      email: 'user@example.com',
      name: null,
      firstName: null,
      lastName: null,
      username: 'planty',
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-01'),
      role: 'user',
      status: 'active',
    }

    // The startup check retries a failed profile read twice, 1.5 s apart.
    const pastStartupRetries = () =>
      act(() => jest.advanceTimersByTimeAsync(3000))

    beforeEach(() => {
      jest.useFakeTimers()
    })

    afterEach(() => {
      jest.useRealTimers()
      const client = require('@/utils/client')
      mockGetStoredAccessToken.mockReturnValue(Effect.succeed(Option.none()))
      mockGetStoredUserProfile.mockReturnValue(Effect.succeed(Option.none()))
      client.apiEffectRunner.mockReset()
      client.isAuthFailureError.mockReturnValue(false)
    })

    it('restores session from cached profile on transient startup failure', async () => {
      const { apiEffectRunner } = require('@/utils/client')

      mockGetStoredAccessToken.mockReturnValue(
        Effect.succeed(Option.some('token-1'))
      )
      mockGetStoredUserProfile.mockReturnValue(
        Effect.succeed(Option.some(cachedUser))
      )

      // getCurrentUser fails during the startup check (initial attempt
      // + 2 retries), then succeeds for the background reconcile
      let getCurrentUserCalls = 0
      apiEffectRunner.mockImplementation((_group: string, endpoint: string) => {
        if (endpoint === 'getCurrentUser') {
          getCurrentUserCalls += 1
          if (getCurrentUserCalls <= 3) {
            return Promise.reject(new Error('Network request failed'))
          }
          return Promise.resolve(cachedUser)
        }
        return Promise.resolve({ id: 'device-1' })
      })

      const { result } = renderHook(() => useAuth(), { wrapper })
      await pastStartupRetries()

      await waitFor(() => {
        expect(result.current.state._tag).toBe('Authenticated')
      })
    })

    it('falls back to Unauthenticated on transient failure without a cached profile', async () => {
      const { apiEffectRunner } = require('@/utils/client')

      mockGetStoredAccessToken.mockReturnValue(
        Effect.succeed(Option.some('token-1'))
      )
      mockGetStoredUserProfile.mockReturnValue(Effect.succeed(Option.none()))
      apiEffectRunner.mockImplementation((_group: string, endpoint: string) => {
        if (endpoint === 'getCurrentUser') {
          return Promise.reject(new Error('Network request failed'))
        }
        return Promise.resolve({})
      })

      const { result } = renderHook(() => useAuth(), { wrapper })
      await pastStartupRetries()

      await waitFor(() => {
        expect(result.current.state._tag).toBe('Unauthenticated')
      })
      expect(
        apiEffectRunner.mock.calls.filter(
          ([, endpoint]: [string, string]) => endpoint === 'getCurrentUser'
        )
      ).toHaveLength(3)
    })

    it('logs out and removes the token on a definitive auth failure', async () => {
      const { apiEffectRunner, isAuthFailureError } = require('@/utils/client')

      mockGetStoredAccessToken.mockReturnValue(
        Effect.succeed(Option.some('token-1'))
      )
      mockGetStoredUserProfile.mockReturnValue(
        Effect.succeed(Option.some(cachedUser))
      )
      isAuthFailureError.mockReturnValue(true)
      apiEffectRunner.mockImplementation((_group: string, endpoint: string) => {
        if (endpoint === 'getCurrentUser') {
          return Promise.reject(new Error('Unauthorized'))
        }
        return Promise.resolve({})
      })

      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.state._tag).toBe('Unauthenticated')
      })

      expect(mockRemoveStoredAccessToken).toHaveBeenCalled()
      expect(apiEffectRunner).toHaveBeenCalledTimes(1)
    })
  })

  describe('signing out', () => {
    const signedInUser = {
      id: 'user-a',
      email: 'a@example.com',
      name: null,
      firstName: null,
      lastName: null,
      username: 'usera',
      createdAt: new Date('2025-01-01'),
      updatedAt: new Date('2025-01-01'),
      role: 'user',
      status: 'active',
    }

    const signIn = async () => {
      const { apiEffectRunner } = require('@/utils/client')
      mockGetStoredAccessToken.mockReturnValue(
        Effect.succeed(Option.some('token-a'))
      )
      mockGetStoredUserProfile.mockReturnValue(
        Effect.succeed(Option.some(signedInUser))
      )
      apiEffectRunner.mockImplementation((_group: string, endpoint: string) =>
        Promise.resolve(endpoint === 'getCurrentUser' ? signedInUser : {})
      )

      const queryClient = makeQueryClient()
      const { result } = renderHook(() => useAuth(), {
        wrapper: wrapperWith(queryClient),
      })
      await waitFor(() => {
        expect(result.current.state._tag).toBe('Authenticated')
      })
      queryClient.setQueryData(
        USER_SETTINGS_QUERY_KEY,
        Result.succeed(mockUserSettings)
      )
      return { queryClient, result }
    }

    afterEach(() => {
      const client = require('@/utils/client')
      mockGetStoredAccessToken.mockReturnValue(Effect.succeed(Option.none()))
      mockGetStoredUserProfile.mockReturnValue(Effect.succeed(Option.none()))
      client.apiEffectRunner.mockReset()
    })

    it('drops the signed-out user cached data on logout', async () => {
      const { queryClient, result } = await signIn()

      await act(() => result.current.logout())

      expect(result.current.state._tag).toBe('Unauthenticated')
      expect(queryClient.getQueryData(USER_SETTINGS_QUERY_KEY)).toBeUndefined()
    })

    it('drops the signed-out user cached data when the session expires', async () => {
      const { setOnAuthFailure } = require('@/utils/client')
      const { queryClient, result } = await signIn()
      const onAuthFailure = setOnAuthFailure.mock.calls.findLast(
        ([callback]: [unknown]) => callback !== null
      )[0]

      await act(() => onAuthFailure())

      expect(result.current.state._tag).toBe('Unauthenticated')
      expect(queryClient.getQueryData(USER_SETTINGS_QUERY_KEY)).toBeUndefined()
    })
  })

  describe('signed-out routing', () => {
    beforeEach(() => {
      mockReplace.mockClear()
    })

    afterEach(() => {
      mockSegments = ['(app)']
    })

    it('keeps a signed-out user on the magic-link verify screen', async () => {
      mockSegments = ['(auth)', 'verify']
      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.state._tag).toBe('Unauthenticated')
      })

      expect(mockReplace).not.toHaveBeenCalled()
    })

    it('sends a signed-out user on another auth screen to the welcome screen', async () => {
      mockSegments = ['(auth)', 'onboarding']
      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.state._tag).toBe('Unauthenticated')
      })

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/(auth)/welcome')
      })
    })

    // `/` also matches the Home tab, so redirecting there left a signed-out
    // user inside the app.
    it('takes a user signed out inside the app to the welcome screen, not /', async () => {
      mockSegments = ['(app)', '(tabs)']
      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.state._tag).toBe('Unauthenticated')
      })

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/(auth)/welcome')
      })
      expect(mockReplace).not.toHaveBeenCalledWith('/')
    })
  })
})
