import {
  mockAdminUser,
  mockSuspendedUser,
  mockUsers,
} from '@lily/api/__tests__/fixtures/users'
import {
  createMockJWTService,
  type MockJWTServiceOptions,
} from '@lily/api/__tests__/mocks/jwt.service'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import { UserRepository } from '@lily/api/repositories/user.repository'
import { AdminAuthBase } from '@lily/api/services/admin/middleware.impl'
import { AdminAuth } from '@lily/api/services/admin/middleware.types'
import { AuthenticationBase } from '@lily/api/services/auth/middleware.impl'
import { Authentication } from '@lily/api/services/auth/middleware.types'
import type { User } from '@lily/shared'
import { Effect, FileSystem, Layer, Path, Schema } from 'effect'
import { Etag, HttpPlatform, HttpRouter } from 'effect/http'
import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiGroup,
} from 'effect/http-api'
import { SqlError, UnknownError } from 'effect/sql/SqlError'
import { describe, expect, it } from 'vitest'

const UserProbe = HttpApiGroup.make('userProbe')
  .add(HttpApiEndpoint.get('me', '/me', { success: Schema.String }))
  .middleware(Authentication)

const AdminProbe = HttpApiGroup.make('adminProbe')
  .add(HttpApiEndpoint.get('adminMe', '/admin/me', { success: Schema.String }))
  .middleware(AdminAuth)

const ProbeApi = HttpApi.make('probe').add(UserProbe).add(AdminProbe)

const ProbeHandlersLive = Layer.mergeAll(
  HttpApiBuilder.group(ProbeApi, 'userProbe', (handlers) =>
    handlers.handle('me', () => Effect.succeed('ok'))
  ),
  HttpApiBuilder.group(ProbeApi, 'adminProbe', (handlers) =>
    handlers.handle('adminMe', () => Effect.succeed('ok'))
  )
)

const PlatformLive = Layer.mergeAll(
  Path.layer,
  Etag.layer,
  HttpPlatform.layer
).pipe(Layer.provideMerge(FileSystem.layerNoop({})))

const unreachableUserRepository = Layer.effect(
  UserRepository,
  Effect.gen(function* () {
    const repo = yield* UserRepository
    return {
      ...repo,
      findById: () =>
        Effect.fail(
          new SqlError({
            reason: new UnknownError({
              cause: new Error('connection terminated unexpectedly'),
              message: 'connection terminated unexpectedly',
            }),
          })
        ),
    }
  })
).pipe(Layer.provide(createMockUserRepository(mockUsers)))

const call = async (options: {
  readonly path: '/me' | '/admin/me'
  readonly jwt: MockJWTServiceOptions
  readonly users: Layer.Layer<UserRepository>
}) => {
  const deps = Layer.merge(createMockJWTService(options.jwt), options.users)
  const apiLayer = HttpApiBuilder.layer(ProbeApi).pipe(
    Layer.provide(ProbeHandlersLive),
    Layer.provide(
      Layer.mergeAll(AuthenticationBase, AdminAuthBase).pipe(
        Layer.provide(deps)
      )
    ),
    Layer.provide(PlatformLive)
  )
  const web = HttpRouter.toWebHandler(apiLayer, { disableLogger: true })
  try {
    const response = await web.handler(
      new Request(`http://localhost${options.path}`, {
        headers: { authorization: 'Bearer some-token' },
      })
    )
    const body: unknown = await response.json()
    return { status: response.status, body }
  } finally {
    await web.dispose()
  }
}

const activeUser = {
  sub: 'user-1',
  email: 'test@example.com',
  role: 'user',
  status: 'active',
} as const

const activeAdmin = {
  sub: 'admin-1',
  email: 'admin@example.com',
  role: 'admin',
  status: 'active',
} as const

const usersOf = (users: User[]) => createMockUserRepository(users)

describe('auth middleware when the user lookup cannot reach the database', () => {
  it('Authentication answers 503, not 401', async () => {
    const result = await call({
      path: '/me',
      jwt: { verifyResult: activeUser },
      users: unreachableUserRepository,
    })

    expect(result).toMatchObject({
      status: 503,
      body: { _tag: 'ServiceUnavailableError' },
    })
  })

  it('AdminAuth answers 503, not 403', async () => {
    const result = await call({
      path: '/admin/me',
      jwt: { verifyResult: activeAdmin },
      users: unreachableUserRepository,
    })

    expect(result).toMatchObject({
      status: 503,
      body: { _tag: 'ServiceUnavailableError' },
    })
  })
})

describe('auth middleware credential rejections keep their status', () => {
  it('Authentication answers 401 for an invalid token', async () => {
    const result = await call({
      path: '/me',
      jwt: { shouldFailVerify: true },
      users: usersOf(mockUsers),
    })

    expect(result).toMatchObject({
      status: 401,
      body: { _tag: 'UnauthorizedError' },
    })
  })

  it('Authentication answers 401 for a user suspended since the token was issued', async () => {
    const result = await call({
      path: '/me',
      jwt: { verifyResult: { ...activeUser, sub: 'user-suspended' } },
      users: usersOf([mockSuspendedUser]),
    })

    expect(result).toMatchObject({
      status: 401,
      body: { _tag: 'UnauthorizedError', message: 'Account is not active' },
    })
  })

  it('Authentication lets an active user through', async () => {
    const result = await call({
      path: '/me',
      jwt: { verifyResult: activeUser },
      users: usersOf(mockUsers),
    })

    expect(result).toEqual({ status: 200, body: 'ok' })
  })

  it('AdminAuth answers 403 for an invalid token', async () => {
    const result = await call({
      path: '/admin/me',
      jwt: { shouldFailVerify: true },
      users: usersOf([mockAdminUser]),
    })

    expect(result).toMatchObject({
      status: 403,
      body: { _tag: 'ForbiddenError' },
    })
  })
})
