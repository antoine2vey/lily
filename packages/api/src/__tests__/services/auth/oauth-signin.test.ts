import { mockUser1 } from '@lily/api/__tests__/fixtures/users'
import { createMockJWTService } from '@lily/api/__tests__/mocks/jwt.service'
import { createMockOAuthIdentityRepository } from '@lily/api/__tests__/mocks/oauth-identity.repository'
import { createMockOAuthVerifier } from '@lily/api/__tests__/mocks/oauth-verifier.service'
import { createMockPgDrizzle } from '@lily/api/__tests__/mocks/pg-drizzle'
import {
  clearRefreshTokenStore,
  createMockRefreshTokenRepository,
  getRefreshTokenStore,
} from '@lily/api/__tests__/mocks/refresh-token.repository'
import { createMockUserRepository } from '@lily/api/__tests__/mocks/user.repository'
import {
  type CreateUserData,
  UserRepository,
} from '@lily/api/repositories/user.repository'
import { oauthSignIn } from '@lily/api/services/auth/endpoints/oauth-signin'
import type { OAuthIdentity } from '@lily/api/services/oauth-verifier/service'
import type { User } from '@lily/shared'
import { Effect, Layer } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

const verifiedGoogle: OAuthIdentity = {
  sub: 'google-sub-123',
  email: 'merge@example.com',
  emailVerified: true,
  name: 'Merge User',
  firstName: 'Merge',
  lastName: 'User',
}

const verifiedApple: OAuthIdentity = {
  sub: 'apple-sub-456',
  email: 'apple-user@example.com',
  emailVerified: true,
  name: null,
  firstName: null,
  lastName: null,
}

const buildLayer = (opts: {
  users?: User[]
  identities?: Parameters<typeof createMockOAuthIdentityRepository>[0]
  verifier?: Parameters<typeof createMockOAuthVerifier>[0]
}) => {
  const { layer: identityLayer, store } = createMockOAuthIdentityRepository(
    opts.identities
  )
  const createdUsers: CreateUserData[] = []
  const userLayer = Layer.effect(
    UserRepository,
    Effect.gen(function* () {
      const repo = yield* UserRepository
      return {
        ...repo,
        create: (data: CreateUserData) => {
          createdUsers.push(data)
          return repo.create(data)
        },
      }
    })
  ).pipe(Layer.provide(createMockUserRepository(opts.users ?? [])))
  const layer = Layer.mergeAll(
    userLayer,
    createMockRefreshTokenRepository({ tokens: [] }),
    createMockJWTService({}),
    createMockOAuthVerifier(opts.verifier ?? {}),
    identityLayer,
    createMockPgDrizzle()
  )
  return { layer, store, createdUsers }
}

describe('oauthSignIn', () => {
  afterEach(() => clearRefreshTokenStore())

  it('creates a new user when no identity and no matching email', async () => {
    const { layer } = buildLayer({
      users: [],
      verifier: { google: verifiedGoogle },
    })

    const result = await Effect.runPromise(
      oauthSignIn({
        provider: 'google',
        idToken: 'token',
      }).pipe(Effect.provide(layer))
    )

    expect(result.accessToken).toBeDefined()
    expect(result.user.email).toBe('merge@example.com')
  })

  it('merges into existing verified user with same email', async () => {
    const existing: User = {
      ...mockUser1,
      email: 'merge@example.com',
      emailVerified: true,
    }
    const { layer, store } = buildLayer({
      users: [existing],
      verifier: { google: verifiedGoogle },
    })

    const result = await Effect.runPromise(
      oauthSignIn({ provider: 'google', idToken: 'token' }).pipe(
        Effect.provide(layer)
      )
    )

    expect(result.user.id).toBe(existing.id)
    expect(store.identities.length).toBe(1)
    expect(store.identities[0]?.userId).toBe(existing.id)
    expect(store.identities[0]?.provider).toBe('google')
  })

  it('reuses linked identity without creating a new user or new link', async () => {
    const existing: User = {
      ...mockUser1,
      email: 'merge@example.com',
      emailVerified: true,
    }
    const { layer, store } = buildLayer({
      users: [existing],
      identities: [
        {
          id: 'oauth-existing',
          userId: existing.id,
          provider: 'google',
          providerUserId: verifiedGoogle.sub,
          providerEmail: verifiedGoogle.email,
          providerName: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      verifier: { google: verifiedGoogle },
    })

    const result = await Effect.runPromise(
      oauthSignIn({ provider: 'google', idToken: 'token' }).pipe(
        Effect.provide(layer)
      )
    )

    expect(result.user.id).toBe(existing.id)
    expect(store.identities.length).toBe(1)
    expect(store.identities[0]?.providerName).toBe('Merge User')
  })

  it('fails when verifier rejects the token', async () => {
    const { layer } = buildLayer({
      users: [],
      verifier: { failGoogle: 'invalid signature' },
    })

    const exit = await Effect.runPromiseExit(
      oauthSignIn({ provider: 'google', idToken: 'bad' }).pipe(
        Effect.provide(layer)
      )
    )
    expect(exit._tag).toBe('Failure')
  })

  it('refuses merge when neither side is verified', async () => {
    const existing: User = {
      ...mockUser1,
      email: 'merge@example.com',
      emailVerified: false,
    }
    const unverifiedGoogle: OAuthIdentity = {
      ...verifiedGoogle,
      emailVerified: false,
    }
    const { layer, store } = buildLayer({
      users: [existing],
      verifier: { google: unverifiedGoogle },
    })

    const exit = await Effect.runPromiseExit(
      oauthSignIn({ provider: 'google', idToken: 'token' }).pipe(
        Effect.provide(layer)
      )
    )
    expect(exit._tag).toBe('Failure')
    expect(store.identities.length).toBe(0)
  })

  it('handles Apple sign-in with first-time fullName payload', async () => {
    const { layer, store } = buildLayer({
      users: [],
      verifier: { apple: verifiedApple },
    })

    const result = await Effect.runPromise(
      oauthSignIn({
        provider: 'apple',
        idToken: 'token',
        fullName: { givenName: 'Tim', familyName: 'Apple' },
      }).pipe(Effect.provide(layer))
    )

    expect(result.user.email).toBe(verifiedApple.email)
    expect(store.identities[0]?.providerName).toBe('Tim Apple')
  })

  it('refuses to link an unverified provider email to an existing verified account', async () => {
    const existing: User = {
      ...mockUser1,
      email: 'merge@example.com',
      emailVerified: true,
    }
    const { layer, store } = buildLayer({
      users: [existing],
      verifier: { google: { ...verifiedGoogle, emailVerified: false } },
    })

    const error = await Effect.runPromise(
      oauthSignIn({ provider: 'google', idToken: 'token' }).pipe(
        Effect.flip,
        Effect.provide(layer)
      )
    )

    expect(error._tag).toBe('AuthError')
    expect(store.identities).toEqual([])
    expect(getRefreshTokenStore()).toEqual([])
  })

  it('refuses to create an account from an unverified provider email', async () => {
    const { layer, store, createdUsers } = buildLayer({
      users: [],
      verifier: { apple: { ...verifiedApple, emailVerified: false } },
    })

    const error = await Effect.runPromise(
      oauthSignIn({ provider: 'apple', idToken: 'token' }).pipe(
        Effect.flip,
        Effect.provide(layer)
      )
    )

    expect(error._tag).toBe('AuthError')
    expect(createdUsers).toEqual([])
    expect(store.identities).toEqual([])
    expect(getRefreshTokenStore()).toEqual([])
  })

  it('links a mixed-case provider email to the existing lowercase account', async () => {
    const existing: User = {
      ...mockUser1,
      email: 'merge@example.com',
      emailVerified: true,
    }
    const { layer, store, createdUsers } = buildLayer({
      users: [existing],
      verifier: { google: { ...verifiedGoogle, email: ' Merge@Example.COM ' } },
    })

    const result = await Effect.runPromise(
      oauthSignIn({ provider: 'google', idToken: 'token' }).pipe(
        Effect.provide(layer)
      )
    )

    expect(result.user.id).toBe(existing.id)
    expect(createdUsers).toEqual([])
    expect(store.identities.map((i) => i.userId)).toEqual([existing.id])
  })

  it('creates the account under the normalized provider email', async () => {
    const { layer, createdUsers } = buildLayer({
      users: [],
      verifier: {
        apple: { ...verifiedApple, email: 'Apple-User@Example.com' },
      },
    })

    const result = await Effect.runPromise(
      oauthSignIn({ provider: 'apple', idToken: 'token' }).pipe(
        Effect.provide(layer)
      )
    )

    expect(result.user.email).toBe('apple-user@example.com')
    expect(createdUsers.map((u) => u.email)).toEqual(['apple-user@example.com'])
  })

  it('marks an unverified existing account verified when the provider verifies the email', async () => {
    const existing: User = {
      ...mockUser1,
      email: 'merge@example.com',
      emailVerified: false,
    }
    const users = [existing]
    const { layer, store } = buildLayer({
      users,
      verifier: { google: verifiedGoogle },
    })

    const result = await Effect.runPromise(
      oauthSignIn({ provider: 'google', idToken: 'token' }).pipe(
        Effect.provide(layer)
      )
    )

    expect(result.user.id).toBe(existing.id)
    expect(users[0]?.emailVerified).toBe(true)
    expect(store.identities.map((i) => i.userId)).toEqual([existing.id])
  })
})
