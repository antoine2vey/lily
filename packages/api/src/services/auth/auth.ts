import { HttpServerRequest } from '@effect/platform'
import { sendMagicLinkEmail } from '@lily/api/services/email/send-magic-link'
import { sendVerificationEmail } from '@lily/api/services/email/send-verification-email'
import { db } from '@lily/db/client'
import {
  accounts,
  rateLimit,
  sessions,
  verifications,
} from '@lily/db/schema/auth'
import { users } from '@lily/db/schema/users'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { bearer, jwt, magicLink } from 'better-auth/plugins'
import { Effect } from 'effect'

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: users,
      session: sessions,
      account: accounts,
      verification: verifications,
      rateLimit: rateLimit,
    },
  }),
  emailVerification: {
    sendOnSignUp: true,
    expiresIn: 86400, // 24 hours
    sendVerificationEmail: async ({ user, url, token }) => {
      await sendVerificationEmail({ email: user.email, url, token })
    },
  },
  rateLimit: {
    window: 60,
    max: 100,
    storage: 'database',
    customRules: {
      '/api/auth/magic-link': {
        window: 60,
        max: 3,
      },
      '/api/auth/magic-link/verify': {
        window: 10,
        max: 5,
      },
    },
  },
  plugins: [
    magicLink({
      expiresIn: 600,
      sendMagicLink: async ({ email, token, url }) => {
        await sendMagicLinkEmail({ email, token, url })
      },
    }),
    jwt({
      jwks: {
        keyPairConfig: { alg: 'EdDSA' },
      },
    }),
    bearer(),
  ],
})

export class Auth extends Effect.Service<Auth>()('Auth', {
  effect: Effect.gen(function* () {
    return {
      client: Effect.succeed(auth),
      session: Effect.gen(function* () {
        const req = yield* HttpServerRequest.HttpServerRequest

        const session = yield* Effect.tryPromise({
          try: () =>
            auth.api.getSession({
              headers: new Headers(req.headers),
              query: {
                disableCookieCache: true,
              },
            }),
          catch: () => {
            return new Error('No session found')
          },
        })

        return session
      }),
    }
  }),
}) {}
