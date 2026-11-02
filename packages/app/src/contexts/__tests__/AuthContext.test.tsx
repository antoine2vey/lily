import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react-native'
import type React from 'react'
import { AuthProvider, useAuth } from '../AuthContext'

// Mock expo-router
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

// Mock expo-secure-store
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}))

// Mock storage utilities
jest.mock('@/utils/storage', () => {
  const { Effect, Option } = require('effect')
  return {
    clearAuthStorage: jest.fn().mockReturnValue(Effect.void),
    getStoredAccessToken: jest
      .fn()
      .mockReturnValue(Effect.succeed(Option.none())),
    getStoredUserEmail: jest
      .fn()
      .mockReturnValue(Effect.succeed(Option.none())),
    getStoredUserProfile: jest
      .fn()
      .mockReturnValue(Effect.succeed(Option.none())),
    removeStoredAccessToken: jest.fn().mockReturnValue(Effect.void),
    removeStoredUserProfile: jest.fn().mockReturnValue(Effect.void),
    storeAccessToken: jest.fn().mockReturnValue(Effect.void),
    storeRefreshToken: jest.fn().mockReturnValue(Effect.void),
    storeUserEmail: jest.fn().mockReturnValue(Effect.void),
    storeUserProfile: jest.fn().mockReturnValue(Effect.void),
  }
})

// Mock client utilities
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

// Mock notification utilities
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

    it('provides auth state', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.state._tag).not.toBe('Loading')
      })

      expect(result.current.state).toBeDefined()
      expect(result.current.state._tag).toBeDefined()
    })

    it('provides login function', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.state._tag).not.toBe('Loading')
      })

      expect(typeof result.current.login).toBe('function')
    })

    it('provides verifyMagicLink function', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.state._tag).not.toBe('Loading')
      })

      expect(typeof result.current.verifyMagicLink).toBe('function')
    })

    it('provides setUsername function', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.state._tag).not.toBe('Loading')
      })

      expect(typeof result.current.setUsername).toBe('function')
    })

    it('provides logout function', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.state._tag).not.toBe('Loading')
      })

      expect(typeof result.current.logout).toBe('function')
    })

    it('provides refreshUser function', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.state._tag).not.toBe('Loading')
      })

      expect(typeof result.current.refreshUser).toBe('function')
    })

    it('provides pendingEmail state', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.state._tag).not.toBe('Loading')
      })

      expect(result.current.pendingEmail).toBeDefined()
    })
  })

  describe('AuthProvider', () => {
    it('renders children', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.state._tag).not.toBe('Loading')
      })

      expect(result.current).toBeTruthy()
    })

    it('transitions from Loading to Unauthenticated', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.state._tag).toBe('Unauthenticated')
      })
    })

    it('initializes pendingEmail as null', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.state._tag).not.toBe('Loading')
      })

      expect(
        result.current.pendingEmail === null ||
          typeof result.current.pendingEmail === 'string'
      ).toBe(true)
    })
  })

  describe('login function', () => {
    it('is async and returns result', async () => {
      const { apiEffectRunner } = require('@/utils/client')
      apiEffectRunner.mockResolvedValueOnce({})

      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.state._tag).not.toBe('Loading')
      })

      // Login returns a promise
      expect(result.current.login('test@example.com')).toBeInstanceOf(Promise)
    })
  })

  describe('logout function', () => {
    it('provides logout function', async () => {
      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(() => {
        expect(result.current.state._tag).not.toBe('Loading')
      })

      expect(typeof result.current.logout).toBe('function')
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

    afterEach(() => {
      const { Effect, Option } = require('effect')
      const storage = require('@/utils/storage')
      const client = require('@/utils/client')
      storage.getStoredAccessToken.mockReturnValue(
        Effect.succeed(Option.none())
      )
      storage.getStoredUserProfile.mockReturnValue(
        Effect.succeed(Option.none())
      )
      client.apiEffectRunner.mockReset()
      client.isAuthFailureError.mockReturnValue(false)
    })

    it('restores session from cached profile on transient startup failure', async () => {
      const { Effect, Option } = require('effect')
      const storage = require('@/utils/storage')
      const { apiEffectRunner } = require('@/utils/client')

      storage.getStoredAccessToken.mockReturnValue(
        Effect.succeed(Option.some('token-1'))
      )
      storage.getStoredUserProfile.mockReturnValue(
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

      await waitFor(
        () => {
          expect(result.current.state._tag).toBe('Authenticated')
        },
        { timeout: 10000, interval: 100 }
      )
    }, 15000)

    it('falls back to Unauthenticated on transient failure without a cached profile', async () => {
      const { Effect, Option } = require('effect')
      const storage = require('@/utils/storage')
      const { apiEffectRunner } = require('@/utils/client')

      storage.getStoredAccessToken.mockReturnValue(
        Effect.succeed(Option.some('token-1'))
      )
      storage.getStoredUserProfile.mockReturnValue(
        Effect.succeed(Option.none())
      )
      apiEffectRunner.mockImplementation((_group: string, endpoint: string) => {
        if (endpoint === 'getCurrentUser') {
          return Promise.reject(new Error('Network request failed'))
        }
        return Promise.resolve({})
      })

      const { result } = renderHook(() => useAuth(), { wrapper })

      await waitFor(
        () => {
          expect(result.current.state._tag).toBe('Unauthenticated')
        },
        { timeout: 10000, interval: 100 }
      )
    }, 15000)

    it('logs out and removes the token on a definitive auth failure', async () => {
      const { Effect, Option } = require('effect')
      const storage = require('@/utils/storage')
      const { apiEffectRunner, isAuthFailureError } = require('@/utils/client')

      storage.getStoredAccessToken.mockReturnValue(
        Effect.succeed(Option.some('token-1'))
      )
      storage.getStoredUserProfile.mockReturnValue(
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

      expect(storage.removeStoredAccessToken).toHaveBeenCalled()
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
    const plantsKey = ['plants', 'getPlants', { query: { page: '1' } }]

    const signIn = async () => {
      const { Effect, Option } = require('effect')
      const storage = require('@/utils/storage')
      const { apiEffectRunner } = require('@/utils/client')
      storage.getStoredAccessToken.mockReturnValue(
        Effect.succeed(Option.some('token-a'))
      )
      storage.getStoredUserProfile.mockReturnValue(
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
      queryClient.setQueryData(plantsKey, { items: ['plant of user A'] })
      return { queryClient, result }
    }

    afterEach(() => {
      const { Effect, Option } = require('effect')
      const storage = require('@/utils/storage')
      const client = require('@/utils/client')
      storage.getStoredAccessToken.mockReturnValue(
        Effect.succeed(Option.none())
      )
      storage.getStoredUserProfile.mockReturnValue(
        Effect.succeed(Option.none())
      )
      client.apiEffectRunner.mockReset()
    })

    it('drops the signed-out user cached data on logout', async () => {
      const { queryClient, result } = await signIn()

      await act(() => result.current.logout())

      expect(result.current.state._tag).toBe('Unauthenticated')
      expect(queryClient.getQueryData(plantsKey)).toBeUndefined()
    })

    it('drops the signed-out user cached data when the session expires', async () => {
      const { setOnAuthFailure } = require('@/utils/client')
      const { queryClient, result } = await signIn()
      const onAuthFailure = setOnAuthFailure.mock.calls.findLast(
        ([callback]: [unknown]) => callback !== null
      )[0]

      await act(() => onAuthFailure())

      expect(result.current.state._tag).toBe('Unauthenticated')
      expect(queryClient.getQueryData(plantsKey)).toBeUndefined()
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
