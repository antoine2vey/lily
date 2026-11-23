import {
  mockExpiredMagicLink,
  mockMagicLink,
  mockUsedMagicLink,
} from '@lily/api/__tests__/fixtures/magic-links'
import {
  clearMagicLinkStore,
  createMockMagicLinkRepository,
} from '@lily/api/__tests__/mocks/magic-link.repository'
import { magicLinkCallback } from '@lily/api/services/auth/endpoints/magic-link-callback'
import { failureOf } from '@lily/shared/testing'
import { Effect } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'

describe('magicLinkCallback', () => {
  afterEach(() => {
    clearMagicLinkStore()
  })

  it('should return redirect URL for valid token', async () => {
    const result = await Effect.runPromise(
      magicLinkCallback({ token: mockMagicLink.token }).pipe(
        Effect.provide(
          createMockMagicLinkRepository({ magicLinks: [mockMagicLink] })
        )
      )
    )

    expect(result.redirectUrl).toBe(`lily://verify?code=${mockMagicLink.token}`)
  })

  it('should fail with invalid token format (not UUID)', async () => {
    const result = await Effect.runPromiseExit(
      magicLinkCallback({ token: 'not-a-uuid' }).pipe(
        Effect.provide(
          createMockMagicLinkRepository({ magicLinks: [mockMagicLink] })
        )
      )
    )

    expect(failureOf(result)).toMatchObject({
      _tag: 'AuthError',
      message: 'Invalid token format',
    })
  })

  it('should fail with expired magic link', async () => {
    const result = await Effect.runPromiseExit(
      magicLinkCallback({ token: mockExpiredMagicLink.token }).pipe(
        Effect.provide(
          createMockMagicLinkRepository({ magicLinks: [mockExpiredMagicLink] })
        )
      )
    )

    expect(failureOf(result)).toMatchObject({
      _tag: 'AuthError',
      message: 'Invalid or expired magic link',
    })
  })

  it('should fail with already used magic link', async () => {
    const result = await Effect.runPromiseExit(
      magicLinkCallback({ token: mockUsedMagicLink.token }).pipe(
        Effect.provide(
          createMockMagicLinkRepository({ magicLinks: [mockUsedMagicLink] })
        )
      )
    )

    expect(failureOf(result)).toMatchObject({
      _tag: 'AuthError',
      message: 'Invalid or expired magic link',
    })
  })

  it('should fail when magic link not found', async () => {
    const nonExistentToken = 'a1b2c3d4-e5f6-7890-abcd-000000000000'
    const result = await Effect.runPromiseExit(
      magicLinkCallback({ token: nonExistentToken }).pipe(
        Effect.provide(createMockMagicLinkRepository({ magicLinks: [] }))
      )
    )

    expect(failureOf(result)).toMatchObject({
      _tag: 'AuthError',
      message: 'Invalid or expired magic link',
    })
  })

  it('should handle uppercase UUID format', async () => {
    const uppercaseToken = mockMagicLink.token.toUpperCase()
    const magicLinkWithUppercase = {
      ...mockMagicLink,
      token: uppercaseToken,
    }

    const result = await Effect.runPromise(
      magicLinkCallback({ token: uppercaseToken }).pipe(
        Effect.provide(
          createMockMagicLinkRepository({
            magicLinks: [magicLinkWithUppercase],
          })
        )
      )
    )

    expect(result.redirectUrl).toBe(`lily://verify?code=${uppercaseToken}`)
  })
})
