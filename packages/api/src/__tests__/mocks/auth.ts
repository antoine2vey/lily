import {
  Authentication,
  CurrentUser,
} from '@lily/api/services/auth/middleware.types'
import { UnauthorizedError } from '@lily/shared'
import type { UserProfile } from '@lily/shared/auth'
import { Effect, Layer } from 'effect'
import { HttpServerRequest } from 'effect/http'

export const mockUserProfile: UserProfile = {
  id: 'user-1',
  name: 'Test User',
  firstName: null,
  lastName: null,
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
  firstName: null,
  lastName: null,
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
      bearer: (httpEffect) => {
        if (shouldFail || !user) {
          return Effect.fail(new UnauthorizedError({ message: failMessage }))
        }
        return Effect.provideService(httpEffect, CurrentUser, user)
      },
    })
  )
}

export const createMockCurrentUser = (
  user: UserProfile = mockUserProfile
): Layer.Layer<CurrentUser> => {
  return Layer.succeed(CurrentUser, user)
}

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
