import {
  createMockAuth,
  createMockHttpServerRequest,
} from '@lily/api/__tests__/mocks/auth'
import { createMockPgDrizzle } from '@lily/api/__tests__/mocks/pg-drizzle'
import { sendMagicLink } from '@lily/api/services/auth/endpoints/send-magic-link'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('sendMagicLink', () => {
  const createTestLayer = () =>
    Layer.mergeAll(
      createMockAuth({}),
      createMockPgDrizzle(),
      createMockHttpServerRequest()
    )

  it('should send magic link and return success message', async () => {
    const result = await Effect.runPromise(
      sendMagicLink({ email: 'test@example.com' }).pipe(
        Effect.provide(createTestLayer())
      )
    )

    expect(result.message).toBe('Magic link sent to test@example.com')
  })

  it('should include email in success message', async () => {
    const email = 'user@domain.com'
    const result = await Effect.runPromise(
      sendMagicLink({ email }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.message).toContain(email)
  })

  it('should handle different email addresses', async () => {
    const emails = ['alice@test.com', 'bob@example.org', 'charlie@mail.net']

    for (const email of emails) {
      const result = await Effect.runPromise(
        sendMagicLink({ email }).pipe(Effect.provide(createTestLayer()))
      )
      expect(result.message).toBe(`Magic link sent to ${email}`)
    }
  })
})
