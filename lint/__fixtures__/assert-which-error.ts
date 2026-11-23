// Fixture for lint/assert-which-error.grit. scripts/test-lint-rules.sh checks
// that the rule flags exactly the lines that end in `// flag`.
import { defectOf, failureOf } from '@lily/shared/testing'
import { Cause, Exit } from 'effect'
import { expect } from 'vitest'

declare const exit: Exit.Exit<number, { readonly _tag: 'UserNotFoundError' }>
declare const result: { readonly _tag: 'Success' | 'Failure' }

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
}

export const clean = () => {
  expect(failureOf(exit)._tag).toBe('UserNotFoundError')
  expect(failureOf(exit)).toMatchObject({ _tag: 'UserNotFoundError' })
  expect(defectOf(exit)).toEqual(new Error('boom'))
  expect(Exit.isSuccess(exit)).toBe(true)
  expect(exit._tag).toBe('Success')
  const failed = Exit.isFailure(exit)
  if (Exit.isFailure(exit)) throw new Error(String(failed))
}
