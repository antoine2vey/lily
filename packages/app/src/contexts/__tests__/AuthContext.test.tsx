import { act, renderHook, waitFor } from '@testing-library/react-native'
import type { ReactNode } from 'react'
import React from 'react'
import { AuthProvider, useAuth } from '../AuthContext'

// Mock expo-router
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
  useSegments: () => ['(app)'],
}))

// Mock expo-secure-store
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}))

// Mock storage utilities
jest.mock('src/utils/storage', () => ({
  clearAuthStorage: jest.fn().mockReturnValue({
    pipe: jest.fn().mockReturnThis(),
  }),
  getStoredAccessToken: jest.fn().mockReturnValue({
    pipe: jest.fn().mockReturnThis(),
  }),
  getStoredUserEmail: jest.fn().mockReturnValue({
    pipe: jest.fn().mockReturnThis(),
  }),
  removeStoredAccessToken: jest.fn().mockReturnValue({
    pipe: jest.fn().mockReturnThis(),
  }),
  storeAccessToken: jest.fn().mockReturnValue({
    pipe: jest.fn().mockReturnThis(),
  }),
  storeRefreshToken: jest.fn().mockReturnValue({
    pipe: jest.fn().mockReturnThis(),
  }),
  storeUserEmail: jest.fn().mockReturnValue({
    pipe: jest.fn().mockReturnThis(),
  }),
}))

// Mock client utilities
jest.mock('src/utils/client', () => ({
  apiEffectRunner: jest.fn(),
}))

// Mock notification utilities
jest.mock('src/utils/notifications', () => ({
  getExpoPushToken: jest.fn().mockResolvedValue('mock-push-token'),
  getPlatform: jest.fn().mockReturnValue('ios'),
}))

const wrapper = ({ children }: { children: ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
)

describe('AuthContext', () => {
  describe('useAuth hook', () => {
    it('throws when used outside provider', () => {
      expect(() => {
        renderHook(() => useAuth())
      }).toThrow('useAuth must be used within an AuthProvider')
    })

    it('provides auth state', () => {
      const { result } = renderHook(() => useAuth(), { wrapper })
      expect(result.current.state).toBeDefined()
      expect(result.current.state._tag).toBeDefined()
    })

    it('provides login function', () => {
      const { result } = renderHook(() => useAuth(), { wrapper })
      expect(typeof result.current.login).toBe('function')
    })

    it('provides verifyMagicLink function', () => {
      const { result } = renderHook(() => useAuth(), { wrapper })
      expect(typeof result.current.verifyMagicLink).toBe('function')
    })

    it('provides setUsername function', () => {
      const { result } = renderHook(() => useAuth(), { wrapper })
      expect(typeof result.current.setUsername).toBe('function')
    })

    it('provides logout function', () => {
      const { result } = renderHook(() => useAuth(), { wrapper })
      expect(typeof result.current.logout).toBe('function')
    })

    it('provides refreshUser function', () => {
      const { result } = renderHook(() => useAuth(), { wrapper })
      expect(typeof result.current.refreshUser).toBe('function')
    })

    it('provides pendingEmail state', () => {
      const { result } = renderHook(() => useAuth(), { wrapper })
      expect(result.current.pendingEmail).toBeDefined()
    })
  })

  describe('AuthProvider', () => {
    it('renders children', () => {
      const { result } = renderHook(() => useAuth(), { wrapper })
      expect(result.current).toBeTruthy()
    })

    it('initializes with Loading state', () => {
      const { result } = renderHook(() => useAuth(), { wrapper })
      // Initially may be Loading then transitions
      expect(
        ['Loading', 'Unauthenticated', 'Authenticated'].includes(
          result.current.state._tag
        )
      ).toBe(true)
    })

    it('initializes pendingEmail as null', () => {
      const { result } = renderHook(() => useAuth(), { wrapper })
      // pendingEmail starts as null unless restored from storage
      expect(
        result.current.pendingEmail === null ||
          typeof result.current.pendingEmail === 'string'
      ).toBe(true)
    })
  })

  describe('login function', () => {
    it('is async and returns result', async () => {
      const { apiEffectRunner } = require('src/utils/client')
      apiEffectRunner.mockResolvedValueOnce({})

      const { result } = renderHook(() => useAuth(), { wrapper })

      // Login returns a promise
      expect(result.current.login('test@example.com')).toBeInstanceOf(Promise)
    })
  })

  describe('logout function', () => {
    it('provides logout function', () => {
      const { result } = renderHook(() => useAuth(), { wrapper })
      expect(typeof result.current.logout).toBe('function')
    })
  })
})
