import type { UserProfile } from '@lily/shared/auth'
import type { ReactNode } from 'react'
import { createContext, useContext } from 'react'
import { mockNow } from '../utils/dates'

// ============================================================================
// Mock Auth Context
// ============================================================================

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

export const mockAuthLogin = jest.fn().mockResolvedValue({ success: true })
export const mockAuthVerifyMagicLink = jest
  .fn()
  .mockResolvedValue({ success: true })
export const mockAuthSetUsername = jest
  .fn()
  .mockResolvedValue({ success: true })
export const mockAuthLogout = jest.fn().mockResolvedValue(undefined)
export const mockAuthRefreshUser = jest.fn().mockResolvedValue(undefined)

const MockAuthContext = createContext<AuthContextValue | null>(null)

export const defaultMockUser: UserProfile = {
  id: 'user-1',
  email: 'test@example.com',
  username: 'testuser',
  name: 'Test User',
  role: 'user',
  status: 'active',
  createdAt: mockNow(),
  updatedAt: mockNow(),
}

interface MockAuthProviderProps {
  children: ReactNode
  state?: AuthState
  pendingEmail?: string | null
}

export function MockAuthProvider({
  children,
  state = {
    _tag: 'Authenticated',
    user: defaultMockUser,
    accessToken: 'mock-token',
  },
  pendingEmail = null,
}: MockAuthProviderProps) {
  const value: AuthContextValue = {
    state,
    pendingEmail,
    login: mockAuthLogin,
    verifyMagicLink: mockAuthVerifyMagicLink,
    setUsername: mockAuthSetUsername,
    logout: mockAuthLogout,
    refreshUser: mockAuthRefreshUser,
  }

  return (
    <MockAuthContext.Provider value={value}>
      {children}
    </MockAuthContext.Provider>
  )
}

export function useMockAuth(): AuthContextValue {
  const context = useContext(MockAuthContext)
  if (!context) {
    throw new Error('useMockAuth must be used within a MockAuthProvider')
  }
  return context
}

// ============================================================================
// Reset Mocks
// ============================================================================

export function resetProviderMocks() {
  mockAuthLogin.mockClear()
  mockAuthVerifyMagicLink.mockClear()
  mockAuthSetUsername.mockClear()
  mockAuthLogout.mockClear()
  mockAuthRefreshUser.mockClear()
}
