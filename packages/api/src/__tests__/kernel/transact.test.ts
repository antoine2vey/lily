import { MockOutboxLive } from '@lily/api/__tests__/mocks/outbox'
import { createMockSqlClient } from '@lily/api/__tests__/mocks/sql-client'
import { CanopyStore, lockPlan } from '@lily/api/contexts/canopy/store'
import {
  Transaction,
  transact,
  transactQuietly,
} from '@lily/api/kernel/transact'
import { Effect, Layer } from 'effect'
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
