import { createMockSqlClient } from '@lily/api/__tests__/mocks/sql-client'
import { transactInMemory } from '@lily/api/__tests__/mocks/transaction'
import { LockOrderDefect, type Strength } from '@lily/api/kernel/ladder'
import {
  accountWriteStrength,
  lockRows,
  lockRowsNamed,
  rowsToLock,
  writeAccount,
} from '@lily/api/kernel/locks'
import { transactQuietly } from '@lily/api/kernel/transact'
import type { PgDrizzle } from '@lily/db/effect-drizzle'
import { Array, Cause, Effect, Exit } from 'effect'
import type * as SqlClient from 'effect/sql/SqlClient'
import type { SqlError } from 'effect/sql/SqlError'
import { describe, expect, it } from 'vitest'

const selecting = (...ids: ReadonlyArray<string>) => {
  const asked: Array<Strength> = []
  return {
    asked,
    query: {
      orderBy: () => ({
        for: (
          strength: Strength
        ): Effect.Effect<ReadonlyArray<{ readonly id: string }>, SqlError> =>
          Effect.sync(() => {
            asked.push(strength)
            return Array.map(ids, (id) => ({ id }))
          }),
      }),
    },
  }
}

const db = {
  update: () => ({ set: (values: unknown) => values }),
} as unknown as PgDrizzle['Service']

const inOneTransaction = <A, E>(
  body: Effect.Effect<A, E, SqlClient.SqlClient>
) =>
  Effect.runPromiseExit(
    transactQuietly(body).pipe(Effect.provide(createMockSqlClient()))
  )

const defectOf = <A, E>(exit: Exit.Exit<A, E>) =>
  Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined

describe('the lock ladder', () => {
  it('lets a transaction climb it in order', async () => {
    const exit = await inOneTransaction(
      Effect.gen(function* () {
        yield* lockRowsNamed(
          'Delegation',
          'update',
          ['d1'],
          selecting('d1').query
        )
        yield* lockRowsNamed(
          'Account',
          'no key update',
          ['u1'],
          selecting('u1').query
        )
        yield* lockRows('Plant', 'no key update', selecting('p1', 'p2').query)
        return yield* lockRows('Notification', 'update', selecting('n1').query)
      })
    )

    expect(exit).toEqual(Exit.succeed([{ id: 'n1' }]))
  })

  it('dies when a transaction asks for a kind below one it holds', async () => {
    const exit = await inOneTransaction(
      Effect.andThen(
        lockRows('Plant', 'no key update', selecting('p1').query),
        lockRows('Delegation', 'update', selecting('d1').query)
      )
    )

    expect(defectOf(exit)).toEqual(
      new LockOrderDefect({ wanted: 'Delegation', after: 'Plant' })
    )
    expect(defectOf(exit)).toHaveProperty(
      'message',
      'lock order: Delegation asked after Plant'
    )
  })

  it('refuses before the statement that would wait is sent', async () => {
    const late = selecting('d1')
    await inOneTransaction(
      Effect.andThen(
        lockRows('Plant', 'no key update', selecting('p1').query),
        lockRows('Delegation', 'update', late.query)
      )
    )

    expect(late.asked).toEqual([])
  })

  it('dies for a write that locks its rows in a subquery too', async () => {
    const exit = await inOneTransaction(
      Effect.andThen(
        rowsToLock('Notification', 'update', selecting('n1').query),
        lockRowsNamed('Account', 'no key update', ['u1'], selecting('u1').query)
      )
    )

    expect(defectOf(exit)).toEqual(
      new LockOrderDefect({ wanted: 'Account', after: 'Notification' })
    )
  })

  it.each([
    [
      'named',
      lockRowsNamed('Delegation', 'update', ['d1'], selecting('d1').query),
    ],
    [
      'returned by a predicate',
      lockRows('Delegation', 'update', selecting('d1').query),
    ],
  ])(
    'lets rows it holds, %s, be named again below the top',
    async (_how, first) => {
      const exit = await inOneTransaction(
        Effect.gen(function* () {
          yield* first
          yield* lockRows('Plant', 'no key update', selecting('p1').query)
          return yield* lockRowsNamed(
            'Delegation',
            'update',
            ['d1'],
            selecting('d1').query
          )
        })
      )

      expect(exit).toEqual(Exit.succeed([{ id: 'd1' }]))
    }
  )

  it('dies when an account is written after a kind above it', async () => {
    let written = false
    const exit = await inOneTransaction(
      Effect.gen(function* () {
        yield* lockRows('Notification', 'update', selecting('n1').query)
        yield* writeAccount(db, 'u1', { bio: 'b' }, () =>
          Effect.sync(() => {
            written = true
          })
        )
      })
    )

    expect(defectOf(exit)).toEqual(
      new LockOrderDefect({ wanted: 'Account', after: 'Notification' })
    )
    expect(written).toBe(false)
  })

  it('counts an account write as a lock on the account', async () => {
    const exit = await inOneTransaction(
      Effect.gen(function* () {
        yield* writeAccount(db, 'u1', { bio: 'b' }, () => Effect.void)
        yield* lockRows('Notification', 'update', selecting('n1').query)
        yield* writeAccount(db, 'u1', { tips: false }, () => Effect.void)
        yield* lockRows('Delegation', 'update', selecting('d1').query)
      })
    )

    expect(defectOf(exit)).toEqual(
      new LockOrderDefect({ wanted: 'Delegation', after: 'Notification' })
    )
  })

  it('takes an account write for the lock its columns make it', () => {
    expect(accountWriteStrength({ bio: 'b', tips: false })).toBe(
      'no key update'
    )
    expect(accountWriteStrength({ bio: 'b', name: 'lily' })).toBe('update')
    expect(accountWriteStrength({ email: 'lily@example.com' })).toBe('update')
    expect(accountWriteStrength({ id: 'u2' })).toBe('update')
    expect(accountWriteStrength({ bio: 'b', name: undefined })).toBe(
      'no key update'
    )
  })

  it('dies when a rename follows a kind above an account held for a plain write', async () => {
    const exit = await inOneTransaction(
      Effect.gen(function* () {
        yield* writeAccount(db, 'u1', { bio: 'b' }, () => Effect.void)
        yield* lockRows('Notification', 'update', selecting('n1').query)
        yield* writeAccount(db, 'u1', { name: 'lily' }, () => Effect.void)
      })
    )

    expect(defectOf(exit)).toEqual(
      new LockOrderDefect({ wanted: 'Account', after: 'Notification' })
    )
  })

  it('dies when one of the rows named again is not held', async () => {
    const exit = await inOneTransaction(
      Effect.gen(function* () {
        yield* lockRowsNamed(
          'Delegation',
          'update',
          ['d1'],
          selecting('d1').query
        )
        yield* lockRows('Plant', 'no key update', selecting('p1').query)
        yield* lockRowsNamed(
          'Delegation',
          'update',
          ['d1', 'd2'],
          selecting('d1', 'd2').query
        )
      })
    )

    expect(defectOf(exit)).toEqual(
      new LockOrderDefect({ wanted: 'Delegation', after: 'Plant' })
    )
  })

  it('dies when a row held weakly is asked for more strongly below the top', async () => {
    const exit = await inOneTransaction(
      Effect.gen(function* () {
        yield* lockRowsNamed(
          'Account',
          'no key update',
          ['u1'],
          selecting('u1').query
        )
        yield* lockRows('Plant', 'no key update', selecting('p1').query)
        yield* lockRowsNamed('Account', 'update', ['u1'], selecting('u1').query)
      })
    )

    expect(defectOf(exit)).toEqual(
      new LockOrderDefect({ wanted: 'Account', after: 'Plant' })
    )
  })

  it('gives back what a savepoint took when the savepoint rolls back', async () => {
    const exit = await inOneTransaction(
      Effect.gen(function* () {
        yield* transactQuietly(
          Effect.andThen(
            lockRows('Plant', 'no key update', selecting('p1').query),
            Effect.fail('refused' as const)
          )
        ).pipe(Effect.ignore)
        return yield* lockRows('Delegation', 'update', selecting('d1').query)
      })
    )

    expect(exit).toEqual(Exit.succeed([{ id: 'd1' }]))
  })

  it('keeps what a savepoint took when the savepoint is released', async () => {
    const exit = await inOneTransaction(
      Effect.andThen(
        transactQuietly(
          lockRows('Plant', 'no key update', selecting('p1').query)
        ),
        lockRows('Delegation', 'update', selecting('d1').query)
      )
    )

    expect(defectOf(exit)).toEqual(
      new LockOrderDefect({ wanted: 'Delegation', after: 'Plant' })
    )
  })

  it('starts empty in each transaction', async () => {
    const exit = await Effect.runPromiseExit(
      Effect.andThen(
        transactQuietly(
          lockRows('Plant', 'no key update', selecting('p1').query)
        ),
        transactQuietly(lockRows('Delegation', 'update', selecting('d1').query))
      ).pipe(Effect.provide(createMockSqlClient()))
    )

    expect(exit).toEqual(Exit.succeed([{ id: 'd1' }]))
  })

  it('orders nothing in a test transaction that no database transaction backs', async () => {
    const exit = await Effect.runPromiseExit(
      transactInMemory(
        Effect.andThen(
          lockRows('Plant', 'no key update', selecting('p1').query),
          lockRows('Delegation', 'update', selecting('d1').query)
        )
      )
    )

    expect(exit).toEqual(Exit.succeed([{ id: 'd1' }]))
  })

  it('orders nothing outside a transaction, where a lock lasts one statement', async () => {
    const exit = await Effect.runPromiseExit(
      Effect.andThen(
        lockRows('Plant', 'no key update', selecting('p1').query),
        lockRows('Delegation', 'update', selecting('d1').query)
      )
    )

    expect(exit).toEqual(Exit.succeed([{ id: 'd1' }]))
  })
})
