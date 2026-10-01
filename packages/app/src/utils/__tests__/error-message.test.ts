import { UnauthorizedError, UserNotFoundError } from '@lily/shared'
import { Effect } from 'effect'
import { extractErrorMessage, isAuthFailureError } from '@/utils/client'

describe('extractErrorMessage', () => {
  it('returns the message of a tagged error that declares one', () => {
    expect(
      extractErrorMessage(new UnauthorizedError({ message: 'Session expired' }))
    ).toBe('Session expired')
  })

  it('describes a tagged error that has no message field', () => {
    expect(
      extractErrorMessage(new UserNotFoundError({ userId: 'user-1' }))
    ).toBe('{"_tag":"UserNotFoundError","userId":"user-1"}')
  })
})

describe('isAuthFailureError', () => {
  it('sees an auth failure wrapped by Effect.tryPromise', async () => {
    const rejection = await Effect.runPromise(
      Effect.tryPromise(() =>
        Promise.reject(new UnauthorizedError({ message: 'expired' }))
      )
    ).catch((error: unknown) => error)

    expect(isAuthFailureError(rejection)).toBe(true)
  })
})
