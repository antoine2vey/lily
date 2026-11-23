// Fixture for lint/assert-which-error.grit. scripts/test-lint-rules.sh checks
// that the rule flags exactly the lines that end in `// flag`.
import { defectOf, failureOf } from '@lily/shared/testing'
import { Cause, Exit, Result } from 'effect'
import { expect } from 'vitest'

declare const exit: Exit.Exit<number, { readonly _tag: 'UserNotFoundError' }>
declare const result: { readonly _tag: 'Success' | 'Failure' }
declare const decoded: Result.Result<number, { readonly _tag: 'SchemaError' }>
declare const promise: Promise<number>
declare class UserNotFoundError { constructor(args: object) }
declare class CodecError { constructor(args: object) }
declare class AuthError { constructor(args: object) }

export const flagged = () => {
  expect(Exit.isFailure(exit)).toBe(true) // flag
  expect(Exit.isFailure(exit)).toBeTruthy() // flag
  expect(Exit.isFailure(exit) && Cause.squash(exit.cause)).toEqual(null) // flag
  expect({ failed: Exit.isFailure(exit) }).toEqual({ failed: true }) // flag
  expect(Exit.isSuccess(exit)).toBe(false) // flag
  expect(Exit.hasDies(exit)).toBe(true) // flag
  expect(Exit.isFailure(exit) && Cause.hasFails(exit.cause)).toBe(true) // flag
  expect(exit._tag).toBe('Failure') // flag
  expect(result._tag).toEqual('Failure') // flag
  expect(Result.isFailure(decoded)).toBe(true) // flag
  expect(Result.isSuccess(decoded)).toBe(false) // flag
  expect(failureOf(exit)).toMatchObject({ code: 'INVALID_TOKEN' }) // flag
  expect(failureOf(exit)).toMatchObject({ cause: { _tag: 'SqlError' } }) // flag
  expect(promise).rejects.toThrow() // flag
  expect(promise).rejects.toThrowError() // flag
  expect(failureOf(exit)).toEqual(new UserNotFoundError({ message: 'gone' })) // flag
  expect(decoded).toEqual(Result.fail(new CodecError({ message: 'bad' }))) // flag
  expect(failureOf(exit)).toMatchObject(new AuthError({ message: 'x' })) // flag
}

export const clean = () => {
  expect(failureOf(exit)._tag).toBe('UserNotFoundError')
  expect(failureOf(exit)).toMatchObject({ _tag: 'UserNotFoundError' })
  expect(failureOf(exit)).toMatchObject({ code: 'X', _tag: 'JWTError' })
  expect(failureOf(decoded)._tag).toBe('SchemaError')
  expect(Result.isSuccess(decoded)).toBe(true)
  expect(promise).rejects.toThrow(/violates foreign key constraint/)
  expect(promise).rejects.toMatchObject({ _tag: 'SqlError' })
  expect(() => JSON.parse('{')).toThrow()
  expect(failureOf(exit)).toEqual(new UserNotFoundError({ userId: 'u1' }))
  expect(failureOf(exit)).toMatchObject({ _tag: 'AuthError', message: 'x' })
  expect(failureOf(exit).message).toBe('gone')
  expect(() => JSON.parse('{}')).not.toThrow()
  expect(defectOf(exit)).toEqual(new Error('boom'))
  expect(Exit.isSuccess(exit)).toBe(true)
  expect(exit._tag).toBe('Success')
  const failed = Exit.isFailure(exit)
  if (Exit.isFailure(exit)) throw new Error(String(failed))
}
