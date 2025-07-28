import { client } from '@lily/db'
import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { magicLink } from 'better-auth/plugins'
import { Effect } from 'effect'

export const auth = betterAuth({
  database: prismaAdapter(client, {
    provider: 'postgresql',
  }),
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, token, url }) => {
        // send email to user
        console.log('sendMagicLink', email, token, url)
      },
    }),
  ],
})

export class Auth extends Effect.Service<Auth>()('Auth', {
  effect: Effect.succeed(auth),
}) {}
