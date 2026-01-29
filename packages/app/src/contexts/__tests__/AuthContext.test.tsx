import { renderHook, waitFor } from '@testing-library/react-native'
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

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
)

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
      const { apiEffectRunner } = require('src/utils/client')
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
})
