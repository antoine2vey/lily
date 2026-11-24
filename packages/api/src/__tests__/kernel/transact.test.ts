import { MockOutboxLive } from '@lily/api/__tests__/mocks/outbox'
import {
  createMockSqlClient,
  MockTransactionConnection,
} from '@lily/api/__tests__/mocks/sql-client'
import { transactInMemory } from '@lily/api/__tests__/mocks/transaction'
import { CanopyStore } from '@lily/api/contexts/canopy/store'
import { lockPlan } from '@lily/api/contexts/canopy/store/lock-plan'
import {
  Transaction,
  transact,
  transactQuietly,
} from '@lily/api/kernel/transact'
import { failureOf } from '@lily/shared/testing'
import { Context, Data, Effect, Layer, Option, Tracer } from 'effect'
import type * as SqlClient from 'effect/sql/SqlClient'
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

      expect({ failure: failureOf(exit), log }).toEqual({
        failure: new BodyFailed(),
        log: ['body done'],
      })
    }
  )
})

class Greeting extends Context.Service<Greeting, string>()('test/Greeting') {}

describe('Transaction.afterCommit, once the transaction has committed', () => {
  const seenAfterCommit = (registerInside: boolean) =>
    Effect.gen(function* () {
      const seen: unknown[] = []
      const looking = Effect.gen(function* () {
        seen.push({
          greeting: yield* Greeting,
          connection: Option.isSome(
            yield* Effect.serviceOption(MockTransactionConnection)
          ),
          transaction: Option.isSome(yield* Effect.serviceOption(Transaction)),
          span: Option.map(
            yield* Effect.serviceOption(Tracer.ParentSpan),
            (span) => (span._tag === 'Span' ? span.name : 'external')
          ),
        })
      })
      const registering = Effect.flatMap(Transaction, (transaction) =>
        transaction.afterCommit(looking)
      ).pipe(
        Effect.provideService(Greeting, 'registered'),
        Effect.withSpan('inside the transaction')
      )
      const body: Effect.Effect<
        void,
        SqlError,
        Transaction | SqlClient.SqlClient
      > = registerInside ? transactQuietly(registering) : registering
      yield* transactQuietly(body).pipe(
        Effect.withSpan('around the transaction')
      )
      return seen
    }).pipe(Effect.provide(createMockSqlClient()))

  it.each([
    ['the outermost transaction', false],
    ['a savepoint', true],
  ])(
    'runs what %s registered with the services it was registered with, minus the connection, the transaction and the span',
    async (_where, registerInside) => {
      expect(await Effect.runPromise(seenAfterCommit(registerInside))).toEqual([
        {
          greeting: 'registered',
          connection: false,
          transaction: false,
          span: Option.some('around the transaction'),
        },
      ])
    }
  )
})
