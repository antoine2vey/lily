import { HttpServerRequest } from '@effect/platform'
import {
  Authentication,
  CurrentUser,
  Unauthorized,
} from '@lily/api/services/auth/middleware.types'
import type { UserProfile } from '@lily/shared/auth'
import { Effect, Layer } from 'effect'

/**
 * Mock user profile for testing
 */
export const mockUserProfile: UserProfile = {
  id: 'user-1',
  name: 'Test User',
  email: 'test@example.com',
  username: 'testuser',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  role: 'user',
  status: 'active',
}

export const mockAdminProfile: UserProfile = {
  id: 'admin-1',
  name: 'Admin User',
  email: 'admin@example.com',
  username: 'adminuser',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  role: 'admin',
  status: 'active',
}

export interface MockAuthOptions {
  user?: UserProfile | null
  shouldFail?: boolean
  failMessage?: string
}

/**
 * Create a mock Authentication layer for testing
 * Provides a user to the CurrentUser context
 */
export const createMockAuthentication = (
  options: MockAuthOptions = {}
): Layer.Layer<Authentication> => {
  const {
    user = mockUserProfile,
    shouldFail = false,
    failMessage = 'Unauthorized',
  } = options

  return Layer.succeed(
    Authentication,
    Authentication.of({
      bearer: () => {
        if (shouldFail || !user) {
          return Effect.fail(new Unauthorized({ message: failMessage }))
        }
        return Effect.succeed(user)
      },
    })
  )
}

/**
 * Create a mock CurrentUser layer for testing
 * Use this when you need to provide CurrentUser directly without authentication middleware
 */
export const createMockCurrentUser = (
  user: UserProfile = mockUserProfile
): Layer.Layer<CurrentUser> => {
  return Layer.succeed(CurrentUser, user)
}

/**
 * Create a mock HttpServerRequest layer for testing
 */
export const createMockHttpServerRequest = (
  headers: Record<string, string> = {}
): Layer.Layer<HttpServerRequest.HttpServerRequest> => {
  const mockRequest = {
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    method: 'GET',
    url: 'http://localhost:3000/test',
  } as unknown as HttpServerRequest.HttpServerRequest

  return Layer.succeed(HttpServerRequest.HttpServerRequest, mockRequest)
}
