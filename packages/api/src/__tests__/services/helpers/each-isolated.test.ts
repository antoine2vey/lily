import { eachIsolated } from '@lily/api/services/helpers/create-scheduler'
import { Effect, Exit, Fiber, identity } from 'effect'
import { describe, expect, it } from 'vitest'

describe('eachIsolated', () => {
  it('counts what advanced, what stayed and what failed', async () => {
    const tally = await Effect.runPromise(
      eachIsolated(
        'test',
        ['advances', 'stays', 'fails', 'dies', 'advances-too'],
        identity,
        (item) =>
          item === 'fails'
            ? Effect.fail('refused')
            : item === 'dies'
              ? Effect.die('broken')
              : Effect.succeed(item.startsWith('advances'))
      )
    )

    expect(tally).toEqual({ due: 5, advanced: 2, failed: 2 })
  })

  it('runs every item after one that dies', async () => {
    const ran: string[] = []

    await Effect.runPromise(
      eachIsolated('test', ['first', 'second', 'third'], identity, (item) =>
        Effect.suspend(() => {
          ran.push(item)
          return item === 'first' ? Effect.die('broken') : Effect.succeed(true)
        })
      )
    )

    expect(ran).toEqual(['first', 'second', 'third'])
  })

  it('answers an empty tally for no item', async () => {
    const tally = await Effect.runPromise(
      eachIsolated('test', [], identity, () => Effect.succeed(true))
    )

    expect(tally).toEqual({ due: 0, advanced: 0, failed: 0 })
  })

  it('stops at an interruption and does not count it as a failure', async () => {
    const ran: string[] = []

    const exit = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(
          eachIsolated('test', ['first', 'second'], identity, (item) =>
            Effect.suspend(() => {
              ran.push(item)
              return Effect.as(Effect.never, true)
            })
          )
        )
        yield* Effect.yieldNow
        yield* Fiber.interrupt(fiber)
        return yield* Fiber.await(fiber)
      })
    )

    expect(Exit.hasInterrupts(exit)).toBe(true)
    expect(ran).toEqual(['first'])
  })

  it('passes on an interruption raised inside a step', async () => {
    const ran: string[] = []

    const exit = await Effect.runPromiseExit(
      eachIsolated('test', ['first', 'second'], identity, (item) =>
        Effect.suspend(() => {
          ran.push(item)
          return Effect.as(Effect.interrupt, true)
        })
      )
    )

    expect(Exit.hasInterrupts(exit)).toBe(true)
    expect(ran).toEqual(['first'])
  })
})
