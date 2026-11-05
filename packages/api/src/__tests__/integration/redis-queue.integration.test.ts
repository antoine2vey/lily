import { createInMemoryRedis } from '@lily/api/__tests__/mocks/redis-queue'
import { makeRedisMessageQueue } from '@lily/api/services/message-queue/redis.provider'
import type {
  DequeuedMessage,
  IMessageQueue,
  QueueMessage,
} from '@lily/shared/server'
import { Array, Cause, Duration, Effect, Exit, Option, Record } from 'effect'
import Redis from 'ioredis'
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

const REDIS_URL_TEST = process.env.REDIS_URL_TEST ?? ''
const IN_CI_INTEGRATION_JOB =
  process.env.CI === 'true' && Boolean(process.env.DATABASE_URL_TEST)
const MINUTE = 60_000
const T0 = 1_800_000_000_000
const VISIBILITY_TIMEOUT = Duration.minutes(10)
const QUEUE_KEY = 'lily:queue:notifications'
const IN_FLIGHT_KEY = `${QUEUE_KEY}:in-flight`
const CLAIMED_AT_KEY = `${QUEUE_KEY}:in-flight:claimed-at`

const message = (id: string, topic: string, metadata?: unknown) =>
  ({
    id,
    topic,
    payload: {
      userId: 'user-1',
      title: 'Water time',
      body: 'Your plants are thirsty',
      notificationIds: ['5b0f3c1e-8a4d-4e2b-9c7a-1d2e3f4a5b6c'],
      plantIds: [],
      metadata,
    },
    retryCount: 0,
    createdAt: new Date('2026-11-03T10:00:00.000Z'),
    scheduledAt: new Date('2026-11-03T10:00:00.000Z'),
  }) as unknown as QueueMessage

const atMillis = <A, E>(t: number, effect: Effect.Effect<A, E>) => {
  vi.spyOn(Date, 'now').mockReturnValue(t)
  return Effect.runPromise(effect).finally(() => vi.restoreAllMocks())
}

const at = <A, E>(minutes: number, effect: Effect.Effect<A, E>) =>
  atMillis(T0 + minutes * MINUTE, effect)

const dequeued = async (minutes: number, queue: IMessageQueue) => {
  const result = await at(minutes, queue.dequeue)
  expect(result).not.toBeNull()
  return result as DequeuedMessage
}

type Op =
  | { readonly op: 'enqueue'; readonly t: number; readonly msg: QueueMessage }
  | { readonly op: 'dequeue'; readonly t: number }
  | { readonly op: 'ack'; readonly t: number; readonly claim: string }
  | { readonly op: 'refresh'; readonly t: number; readonly claim: string }
  | {
      readonly op: 'requeueStale'
      readonly t: number
      readonly olderThan: Duration.Duration
    }
  | { readonly op: 'drain'; readonly t: number }

interface Seed {
  readonly lists: Record<string, string[]>
  readonly zsets: Record<string, Record<string, number>>
  readonly hashes: Record<string, Record<string, string>>
}

// Claims are random per dequeue, so each run names them d0, d1, ... in
// dequeue order. Ops address claims by that name, and both states key every
// in-flight entry and claim time by it.
const play = async (queue: IMessageQueue, ops: ReadonlyArray<Op>) => {
  const names = new Map<string, string>()
  const claimNamed = (name: string) =>
    Option.getOrElse(
      Option.map(
        Array.findFirst([...names], ([, alias]) => alias === name),
        ([claim]) => claim
      ),
      () => name
    )
  const step = (o: Op): Effect.Effect<unknown, unknown> => {
    switch (o.op) {
      case 'enqueue':
        return queue.enqueue(o.msg)
      case 'dequeue':
        return Effect.map(queue.dequeue, (result) => {
          if (!result) return null
          names.set(result.claim, `d${names.size}`)
          return result.message.id
        })
      case 'ack':
        return queue.ack(claimNamed(o.claim))
      case 'refresh':
        return queue.refreshClaim(claimNamed(o.claim))
      case 'requeueStale':
        return queue.requeueStale(o.olderThan)
      case 'drain':
        return queue.drainLegacyTopicLists
    }
  }
  const results: unknown[] = []
  for (const o of ops) {
    vi.spyOn(Date, 'now').mockReturnValue(o.t)
    const exit = await Effect.runPromiseExit(step(o)).finally(() =>
      vi.restoreAllMocks()
    )
    results.push(Exit.isSuccess(exit) ? exit.value : '<failed>')
  }
  return {
    results,
    nameOf: (claim: string) => names.get(claim) ?? claim,
  }
}

const renamed = <A>(
  record: Record<string, A>,
  nameOf: (claim: string) => string
) =>
  Record.fromEntries(
    Array.map(Record.toEntries(record), ([claim, value]) => [
      nameOf(claim),
      value,
    ])
  )

const realState = async (redis: Redis, nameOf: (claim: string) => string) => {
  const entries = await Promise.all(
    Array.map(await redis.keys('*'), async (key) => {
      const type = await redis.type(key)
      if (type === 'list') return [key, await redis.lrange(key, 0, -1)] as const
      if (type === 'hash')
        return [key, renamed(await redis.hgetall(key), nameOf)] as const
      const members = await redis.zrange(key, 0, '-1')
      const scores = await redis.zmscore(key, ...members)
      return [
        key,
        renamed(
          Record.fromEntries(
            Array.zipWith(members, scores, (member, score) => [
              member,
              Number(score),
            ])
          ),
          nameOf
        ),
      ] as const
    })
  )
  return Record.fromEntries(entries)
}

const fakeState = (seed: Seed, nameOf: (claim: string) => string) =>
  Record.fromEntries([
    ...Array.filter(
      Record.toEntries(seed.lists),
      ([, entries]) => entries.length > 0
    ),
    ...Array.map(
      Array.filter(
        Record.toEntries(seed.hashes),
        ([, h]) => Record.size(h) > 0
      ),
      ([key, h]) => [key, renamed(h, nameOf)] as const
    ),
    ...Array.map(
      Array.filter(Record.toEntries(seed.zsets), ([, z]) => Record.size(z) > 0),
      ([key, z]) => [key, renamed(z, nameOf)] as const
    ),
  ])

const raw = (m: QueueMessage) => JSON.stringify(m)
const m1 = message('m1', 'watering_reminder')
const m2 = message('m2', 'new_follower', { senderId: 'ada' })
const m3 = message('m3', 'daily_tip')
const m4 = message('m4', 'weekly_recap')
const TEN_MINUTES = Duration.toMillis(VISIBILITY_TIMEOUT)
const sweep = (t: number, olderThan = VISIBILITY_TIMEOUT): Op => ({
  op: 'requeueStale',
  t,
  olderThan,
})
const empty = (): Seed => ({ lists: {}, zsets: {}, hashes: {} })

const scenarios: ReadonlyArray<{
  readonly name: string
  readonly seed: () => Seed
  readonly ops: ReadonlyArray<Op>
}> = [
  {
    name: 'a sweep splits claims by age and a second sweep finds nothing',
    seed: empty,
    ops: [
      { op: 'enqueue', t: 1000, msg: m1 },
      { op: 'enqueue', t: 1000, msg: m2 },
      { op: 'enqueue', t: 1000, msg: m3 },
      { op: 'enqueue', t: 1000, msg: m4 },
      { op: 'dequeue', t: 2000 },
      { op: 'dequeue', t: 3000 },
      { op: 'dequeue', t: 4000 },
      { op: 'ack', t: 5000, claim: 'd1' },
      sweep(2500 + TEN_MINUTES),
      sweep(2500 + TEN_MINUTES),
    ],
  },
  {
    name: 'requeued entries come back newest first',
    seed: empty,
    ops: [
      { op: 'enqueue', t: 1000, msg: m1 },
      { op: 'enqueue', t: 1000, msg: m2 },
      { op: 'enqueue', t: 1000, msg: m3 },
      { op: 'dequeue', t: 2000 },
      { op: 'dequeue', t: 3000 },
      sweep(3000 + TEN_MINUTES),
      { op: 'dequeue', t: 4000 + TEN_MINUTES },
      { op: 'dequeue', t: 4001 + TEN_MINUTES },
      { op: 'dequeue', t: 4002 + TEN_MINUTES },
      { op: 'dequeue', t: 4003 + TEN_MINUTES },
      { op: 'ack', t: 5000 + TEN_MINUTES, claim: 'd0' },
      { op: 'ack', t: 5000 + TEN_MINUTES, claim: 'd2' },
      sweep(10 ** 9, Duration.zero),
    ],
  },
  {
    name: 'a claim exactly at the cutoff is requeued, also with a zero timeout',
    seed: empty,
    ops: [
      { op: 'enqueue', t: 1000, msg: m1 },
      { op: 'enqueue', t: 1000, msg: m2 },
      { op: 'dequeue', t: 2000 },
      sweep(2000 + TEN_MINUTES),
      { op: 'dequeue', t: 3000 },
      sweep(3000, Duration.zero),
    ],
  },
  {
    name: 'two identical entries, each acked by its own claim',
    seed: empty,
    ops: [
      { op: 'enqueue', t: 1000, msg: m1 },
      { op: 'enqueue', t: 1000, msg: m1 },
      { op: 'dequeue', t: 2000 },
      { op: 'dequeue', t: 3000 },
      { op: 'ack', t: 4000, claim: 'd0' },
      sweep(4000 + TEN_MINUTES),
    ],
  },
  {
    name: 'a stalled refresh and ack after a requeue leave the second claim',
    seed: empty,
    ops: [
      { op: 'enqueue', t: 0, msg: m1 },
      { op: 'dequeue', t: 0 },
      sweep(11 * MINUTE),
      { op: 'dequeue', t: 11 * MINUTE },
      { op: 'refresh', t: 12 * MINUTE, claim: 'd0' },
      { op: 'ack', t: 12 * MINUTE, claim: 'd0' },
      sweep(30 * MINUTE),
    ],
  },
  {
    name: 'refresh of a live, an acked and an unknown claim',
    seed: empty,
    ops: [
      { op: 'enqueue', t: 0, msg: m1 },
      { op: 'enqueue', t: 0, msg: m2 },
      { op: 'dequeue', t: 0 },
      { op: 'dequeue', t: 0 },
      { op: 'ack', t: MINUTE, claim: 'd1' },
      { op: 'refresh', t: 5 * MINUTE, claim: 'd0' },
      { op: 'refresh', t: 5 * MINUTE, claim: 'd1' },
      { op: 'refresh', t: 5 * MINUTE, claim: 'nobody' },
      sweep(12 * MINUTE),
      sweep(16 * MINUTE),
    ],
  },
  {
    name: 'seeded claims with equal scores requeue in member order',
    seed: () => ({
      lists: {},
      hashes: {
        [IN_FLIGHT_KEY]: { b: raw(m2), a: raw(m1), c: raw(m3), y: raw(m4) },
      },
      zsets: {
        [CLAIMED_AT_KEY]: { b: 5000, a: 5000, c: 4000, y: 9 * TEN_MINUTES },
      },
    }),
    ops: [
      sweep(6000 + TEN_MINUTES),
      { op: 'dequeue', t: 7000 + TEN_MINUTES },
      { op: 'dequeue', t: 7000 + TEN_MINUTES },
    ],
  },
  {
    name: 'an in-flight entry with no claim time is never requeued',
    seed: () => ({
      lists: {},
      hashes: { [IN_FLIGHT_KEY]: { orphan: raw(m1), live: raw(m2) } },
      zsets: { [CLAIMED_AT_KEY]: { live: 1000 } },
    }),
    ops: [sweep(10 ** 9)],
  },
  {
    name: 'a claim time with no in-flight entry is dropped without blocking the claims after it',
    seed: () => ({
      lists: {},
      hashes: { [IN_FLIGHT_KEY]: { a: raw(m1), z: raw(m3) } },
      zsets: { [CLAIMED_AT_KEY]: { a: 1000, ghost: 2000, z: 3000 } },
    }),
    ops: [sweep(10 ** 9), sweep(10 ** 9)],
  },
  {
    name: 'the legacy drain over pending, processing and claimed keys',
    seed: () => ({
      lists: {
        'lily:notifications:new_follower': ['a2', 'a1'],
        'lily:notifications:new_follower:processing': ['c1'],
        'lily:notifications:daily_tip': ['d1'],
        [QUEUE_KEY]: [raw(m1)],
      },
      zsets: {
        'lily:notifications:new_follower:processing:claimed': { c1: 1 },
        'lily:notifications:watering_reminder:processing:claimed': {
          ghost: 1,
        },
      },
      hashes: {},
    }),
    ops: [
      { op: 'drain', t: 1000 },
      { op: 'drain', t: 2000 },
    ],
  },
  {
    name: 'the legacy drain with only a claimed set left',
    seed: () => ({
      lists: {},
      zsets: {
        'lily:notifications:misting_reminder:processing:claimed': { x: 1 },
      },
      hashes: {},
    }),
    ops: [{ op: 'drain', t: 1000 }],
  },
  {
    name: 'dequeue of an empty queue',
    seed: empty,
    ops: [{ op: 'dequeue', t: 0 }, sweep(30 * MINUTE)],
  },
]

it.runIf(IN_CI_INTEGRATION_JOB)(
  'runs the real-Redis queue tests in the CI integration job',
  () => {
    expect(REDIS_URL_TEST).not.toBe('')
  }
)

describe.skipIf(!REDIS_URL_TEST)('the one queue on real Redis', () => {
  const redis = new Redis(REDIS_URL_TEST)
  const queue = makeRedisMessageQueue(redis)

  beforeEach(() => redis.flushdb())
  afterEach(() => vi.restoreAllMocks())
  afterAll(async () => {
    await redis.flushdb()
    redis.disconnect()
  })

  it("keeps a second consumer's claim when a stalled consumer acks late", async () => {
    await at(0, queue.enqueue(message('msg-1', 'watering_reminder')))
    const stalled = await dequeued(0, queue)
    expect(await at(11, queue.requeueStale(VISIBILITY_TIMEOUT))).toBe(1)
    const second = await dequeued(11, queue)

    await at(12, queue.ack(stalled.claim))

    expect(second.message.id).toBe('msg-1')
    expect(second.claim).not.toBe(stalled.claim)
    expect(await at(30, queue.requeueStale(VISIBILITY_TIMEOUT))).toBe(1)
  })

  it('requeues a claim older than the timeout and keeps a younger one', async () => {
    await at(0, queue.enqueue(message('msg-old', 'watering_reminder')))
    await at(0, queue.enqueue(message('msg-young', 'new_follower')))
    await dequeued(0, queue)
    await dequeued(5, queue)

    expect(await at(11, queue.requeueStale(VISIBILITY_TIMEOUT))).toBe(1)

    const back = await dequeued(11, queue)
    expect(back.message.id).toBe('msg-old')
    expect(await at(11, queue.dequeue)).toBeNull()
  })

  it('leaves no key behind once a message is acked', async () => {
    await at(0, queue.enqueue(message('msg-1', 'watering_reminder')))
    const taken = await dequeued(0, queue)

    await at(1, queue.ack(taken.claim))

    expect(await redis.keys('*')).toEqual([])
  })

  it('keeps a refreshed claim off the stale sweep until it goes quiet', async () => {
    await at(0, queue.enqueue(message('msg-1', 'watering_reminder')))
    const taken = await dequeued(0, queue)

    await at(9, queue.refreshClaim(taken.claim))

    expect(await at(11, queue.requeueStale(VISIBILITY_TIMEOUT))).toBe(0)
    expect(await at(20, queue.requeueStale(VISIBILITY_TIMEOUT))).toBe(1)
  })

  it('does not resurrect an acked claim on refresh', async () => {
    await at(0, queue.enqueue(message('msg-1', 'watering_reminder')))
    const taken = await dequeued(0, queue)
    await at(1, queue.ack(taken.claim))

    await at(2, queue.refreshClaim(taken.claim))

    expect(await redis.keys('*')).toEqual([])
  })

  it('requeues the claims around one with no in-flight entry and drops it', async () => {
    await redis.hset(IN_FLIGHT_KEY, 'a', raw(m1), 'z', raw(m3))
    await redis.zadd(CLAIMED_AT_KEY, 1000, 'a', 2000, 'ghost', 3000, 'z')

    vi.spyOn(Date, 'now').mockReturnValue(10 ** 9)
    const exit = await Effect.runPromiseExit(
      queue.requeueStale(VISIBILITY_TIMEOUT)
    )

    expect(Exit.isSuccess(exit) ? exit.value : Cause.pretty(exit.cause)).toBe(2)
    expect(await redis.lrange(QUEUE_KEY, 0, -1)).toEqual([raw(m1), raw(m3)])
    expect(await redis.hlen(IN_FLIGHT_KEY)).toBe(0)
    expect(await redis.zcard(CLAIMED_AT_KEY)).toBe(0)
  })

  it('keeps the other claim on the same entry when one is acked', async () => {
    await at(0, queue.enqueue(m1))
    await at(0, queue.enqueue(m1))
    const first = await dequeued(1, queue)
    const second = await dequeued(2, queue)

    await at(3, queue.ack(first.claim))

    expect(await redis.hgetall(IN_FLIGHT_KEY)).toEqual({
      [second.claim]: raw(m1),
    })
    expect(await redis.zrange(CLAIMED_AT_KEY, 0, '-1')).toEqual([second.claim])
  })

  it.each(scenarios)(
    'the in-memory fake matches real Redis: $name',
    async ({ seed, ops }) => {
      const realSeed = seed()
      for (const [key, entries] of Record.toEntries(realSeed.lists))
        if (entries.length > 0) await redis.rpush(key, ...entries)
      for (const [key, members] of Record.toEntries(realSeed.zsets))
        for (const [member, score] of Record.toEntries(members))
          await redis.zadd(key, score, member)
      for (const [key, fields] of Record.toEntries(realSeed.hashes))
        for (const [field, value] of Record.toEntries(fields))
          await redis.hset(key, field, value)
      const real = await play(queue, ops)
      const realAfter = await realState(redis, real.nameOf)

      const fakeSeed = seed()
      const fake = await play(
        createInMemoryRedis(fakeSeed.lists, fakeSeed.zsets, fakeSeed.hashes)
          .queue,
        ops
      )

      expect(fake.results).toEqual(real.results)
      expect(fakeState(fakeSeed, fake.nameOf)).toEqual(realAfter)
    }
  )
})
