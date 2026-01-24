import { type QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  type RenderOptions,
  render as rtlRender,
} from '@testing-library/react-native'
import type { ReactElement, ReactNode } from 'react'
import React from 'react'
import { defaultMockUser, MockAuthProvider } from '../mocks/providers'
import { createTestQueryClient } from './query-helpers'

// Re-export everything from testing-library
export * from '@testing-library/react-native'

interface WrapperProps {
  children: ReactNode
}

type AuthState =
  | { _tag: 'Loading' }
  | { _tag: 'Authenticated'; user: typeof defaultMockUser; accessToken: string }
  | { _tag: 'Unauthenticated' }
  | { _tag: 'NeedsUsername'; user: typeof defaultMockUser; accessToken: string }

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  queryClient?: QueryClient
  authState?: AuthState
  pendingEmail?: string | null
  withQueryClient?: boolean
  withAuth?: boolean
}

/**
 * Custom render function that wraps components with commonly needed providers
 */
export function render(
  ui: ReactElement,
  {
    queryClient,
    authState,
    pendingEmail,
    withQueryClient = true,
    withAuth = true,
    ...options
  }: CustomRenderOptions = {}
) {
  const client = queryClient ?? createTestQueryClient()

  const resolvedAuthState = authState ?? {
    _tag: 'Authenticated' as const,
    user: defaultMockUser,
    accessToken: 'mock-token',
  }

  function Wrapper({ children }: WrapperProps) {
    let wrapped = children

    // Wrap with Auth provider if needed
    if (withAuth) {
      wrapped = (
        <MockAuthProvider state={resolvedAuthState} pendingEmail={pendingEmail}>
          {wrapped}
        </MockAuthProvider>
      )
    }

    // Wrap with QueryClient provider if needed
    if (withQueryClient) {
      wrapped = (
        <QueryClientProvider client={client}>{wrapped}</QueryClientProvider>
      )
    }

    return <>{wrapped}</>
  }

  return {
    ...rtlRender(ui, { wrapper: Wrapper, ...options }),
    queryClient: client,
  }
}

/**
 * Render a component without any providers
 * Useful for testing pure presentational components
 */
export function renderBare(ui: ReactElement, options?: RenderOptions) {
  return rtlRender(ui, options)
}

/**
 * Render a component with only the QueryClient provider
 */
export function renderWithQuery(
  ui: ReactElement,
  options?: Omit<CustomRenderOptions, 'withAuth'>
) {
  return render(ui, { ...options, withAuth: false })
}

/**
 * Render a component as an unauthenticated user
 */
export function renderUnauthenticated(
  ui: ReactElement,
  options?: Omit<CustomRenderOptions, 'authState'>
) {
  return render(ui, {
    ...options,
    authState: { _tag: 'Unauthenticated' },
  })
}

/**
 * Render a component as a user needing username setup
 */
export function renderNeedsUsername(
  ui: ReactElement,
  options?: Omit<CustomRenderOptions, 'authState'>
) {
  return render(ui, {
    ...options,
    authState: {
      _tag: 'NeedsUsername',
      user: { ...defaultMockUser, username: undefined },
      accessToken: 'mock-token',
    },
  })
}
