import { HttpServerRequest } from '@effect/platform'
import { sendMagicLinkEmail } from '@lily/api/services/email/send-magic-link'
import { db } from '@lily/db/client'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { magicLink } from 'better-auth/plugins'
import { Effect } from 'effect'

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
  }),
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
