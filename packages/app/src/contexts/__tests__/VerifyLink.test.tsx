import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, waitFor } from '@testing-library/react-native'
import type React from 'react'
import {
  mockRouter,
  setMockSearchParams,
  setMockSegments,
} from '@/__tests__/mocks/navigation'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import VerifyScreen from '../../../app/(auth)/verify'

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

jest.mock('@/utils/client', () => ({
  apiEffectRunner: jest.fn(),
  extractErrorMessage: jest.fn((error: unknown) =>
    error instanceof Error ? error.message : String(error)
  ),
  extractErrorField: jest.fn(),
  isAuthFailureError: jest.fn().mockReturnValue(false),
  setOnAuthFailure: jest.fn(),
}))

jest.mock('@/utils/auth-telemetry', () => ({
  addAuthBreadcrumb: jest.fn(),
  trackAuthAnomaly: jest.fn(),
  trackForcedLogout: jest.fn(),
}))

jest.mock('@/utils/notifications', () => ({
  getDeviceLanguage: jest.fn().mockReturnValue('en'),
  getDeviceTimezone: jest.fn().mockReturnValue('UTC'),
  getExpoPushToken: jest.fn().mockResolvedValue(null),
  getPlatform: jest.fn().mockReturnValue('ios'),
  reconcileLiveActivityTokens: jest.fn().mockResolvedValue(undefined),
  registerLiveActivityTokens: jest.fn().mockResolvedValue(() => {}),
}))

jest.mock('@/components', () => {
  const { Text, View } = require('react-native')
  return {
    MeshBackground: ({ children }: { children: React.ReactNode }) => (
      <View>{children}</View>
    ),
    GlassCard: ({ children }: { children: React.ReactNode }) => (
      <View>{children}</View>
    ),
    MascotHero: ({ title }: { title: string }) => <Text>{title}</Text>,
  }
})

const { Effect, Option } = require('effect')
const storage = require('@/utils/storage')
const { apiEffectRunner } = require('@/utils/client')

const profile = (id: string, email: string) => ({
  id,
  email,
  name: null,
  firstName: null,
  lastName: null,
  username: id,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  role: 'user',
  status: 'active',
})

const userA = profile('user-a', 'a@example.com')
const userB = profile('user-b', 'b@example.com')

const verifyCalls = () =>
  apiEffectRunner.mock.calls.filter(
    ([, endpoint]: [string, string]) => endpoint === 'verifyMagicLink'
  )

function VerifyOnceAuthenticated() {
  const { state } = useAuth()
  return state._tag === 'Authenticated' ? <VerifyScreen /> : null
}

const renderInProvider = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider>{ui}</AuthProvider>
    </QueryClientProvider>
  )

describe('magic link verify screen', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    setMockSegments('(auth)', 'verify')
    setMockSearchParams({ code: 'code-for-user-b' })
    apiEffectRunner.mockImplementation((_group: string, endpoint: string) => {
      if (endpoint === 'getCurrentUser') return Promise.resolve(userA)
      if (endpoint === 'verifyMagicLink') {
        return Promise.resolve({
          accessToken: 'token-b',
          refreshToken: 'refresh-b',
          user: userB,
        })
      }
      return Promise.resolve({})
    })
  })

  describe('with a stored session for user A', () => {
    beforeEach(() => {
      storage.getStoredAccessToken.mockReturnValue(
        Effect.succeed(Option.some('token-a'))
      )
    })

    it('ignores the code and sends the user home when the link opens the app', async () => {
      renderInProvider(<VerifyScreen />)

      await waitFor(
        () => expect(mockRouter.replace).toHaveBeenCalledWith('/'),
        {
          timeout: 5000,
        }
      )
      expect(verifyCalls()).toHaveLength(0)
      expect(storage.storeAccessToken).not.toHaveBeenCalled()
      expect(storage.storeRefreshToken).not.toHaveBeenCalled()
    }, 10000)

    it('ignores the code and sends the user home when the link arrives while signed in', async () => {
      renderInProvider(<VerifyOnceAuthenticated />)

      await waitFor(
        () => expect(mockRouter.replace).toHaveBeenCalledWith('/'),
        {
          timeout: 5000,
        }
      )
      expect(verifyCalls()).toHaveLength(0)
      expect(storage.storeAccessToken).not.toHaveBeenCalled()
      expect(storage.storeRefreshToken).not.toHaveBeenCalled()
    }, 10000)
  })

  describe('signed out', () => {
    beforeEach(() => {
      storage.getStoredAccessToken.mockReturnValue(
        Effect.succeed(Option.none())
      )
    })

    it('verifies the code and stores the new session', async () => {
      renderInProvider(<VerifyScreen />)

      await waitFor(() =>
        expect(storage.storeAccessToken).toHaveBeenCalledWith('token-b')
      )
      expect(verifyCalls()).toHaveLength(1)
      expect(verifyCalls()[0]?.[2]).toMatchObject({
        payload: { code: 'code-for-user-b' },
      })
      expect(storage.storeRefreshToken).toHaveBeenCalledWith('refresh-b')
    })
  })
})
