import { MockOutboxLive } from '@lily/api/__tests__/mocks/outbox'
import { createMockSqlClient } from '@lily/api/__tests__/mocks/sql-client'
import { transactInMemory } from '@lily/api/__tests__/mocks/transaction'
import { CanopyStore, lockPlan } from '@lily/api/contexts/canopy/store'
import {
  Transaction,
  transact,
  transactQuietly,
} from '@lily/api/kernel/transact'
import { Data, Effect, Exit, Layer } from 'effect'
import type { SqlError } from 'effect/sql/SqlError'
import { describe, expect, it } from 'vitest'

type RequirementsOf<T> =
  T extends Effect.Effect<unknown, unknown, infer R> ? R : never

type Requires<T, Service> = [Service] extends [RequirementsOf<T>] ? true : false

describe('Transaction', () => {
  const insideOne = Effect.as(Effect.service(Transaction), 'inside')

  it.each([
    ['transact', transact(insideOne)],
    ['transactQuietly', transactQuietly(insideOne)],
  ])('is provided by %s to its body', async (_name, opened) => {
    const outcome = await Effect.runPromise(
      opened.pipe(
        Effect.provide(Layer.merge(createMockSqlClient(), MockOutboxLive))
      )
    )

    expect(outcome).toBe('inside')
  })

  it('is required by a lock, so lockAndLoad compiles inside transact and nowhere else', () => {
    const lockAndLoad = Effect.flatMap(CanopyStore, (store) =>
      store.lockAndLoad(lockPlan({}))
    )
    const opened = transact(lockAndLoad)
    const outsideTransact: Requires<typeof lockAndLoad, Transaction> = true
    const insideTransact: Requires<typeof opened, Transaction> = false

    expect([outsideTransact, insideTransact]).toEqual([true, false])
  })
})

class BodyFailed extends Data.TaggedError('BodyFailed') {}

type Opener = <A, E>(
  body: Effect.Effect<A, E, Transaction>
) => Effect.Effect<A, E | SqlError>

describe('Transaction.afterCommit', () => {
  const OPENERS: Record<'transactQuietly' | 'transactInMemory', Opener> = {
    transactQuietly: (body) =>
      transactQuietly(body).pipe(Effect.provide(createMockSqlClient())),
    transactInMemory,
  }

  const registering = (log: string[]) =>
    Effect.flatMap(Transaction, (transaction) =>
      transaction.afterCommit(
        Effect.sync(() => {
          log.push('registered effect')
        })
      )
    ).pipe(
      Effect.andThen(
        Effect.sync(() => {
          log.push('body done')
        })
      )
    )

  it.each(['transactQuietly', 'transactInMemory'] as const)(
    'under %s runs what the body registered once the body has succeeded',
    async (opener) => {
      const log: string[] = []

      await Effect.runPromise(OPENERS[opener](registering(log)))

      expect(log).toEqual(['body done', 'registered effect'])
    }
  )

  it.each(['transactQuietly', 'transactInMemory'] as const)(
    'under %s drops what the body registered when the body fails',
    async (opener) => {
      const log: string[] = []

      const exit = await Effect.runPromiseExit(
        OPENERS[opener](Effect.andThen(registering(log), new BodyFailed()))
      )

      expect({ failed: Exit.isFailure(exit), log }).toEqual({
        failed: true,
        log: ['body done'],
      })
    }
  )
})
