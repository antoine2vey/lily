import { createInMemoryRedis } from '@lily/api/__tests__/mocks/redis-queue'
import { makeRedisMessageQueue } from '@lily/api/services/message-queue/redis.provider'
import type {
  DequeuedMessage,
  IMessageQueue,
  QueueMessage,
} from '@lily/shared/server'
import { Array, Duration, Effect, Order, Record } from 'effect'
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
const MINUTE = 60_000
const T0 = 1_800_000_000_000
const VISIBILITY_TIMEOUT = Duration.minutes(10)

const message = (id: string, topic: string) =>
  ({
    id,
    topic,
    payload: {
      userId: 'user-1',
      title: 'Water time',
      body: 'Your plants are thirsty',
      notificationIds: ['5b0f3c1e-8a4d-4e2b-9c7a-1d2e3f4a5b6c'],
      plantIds: [],
    },
    retryCount: 0,
    createdAt: new Date('2026-11-03T10:00:00.000Z'),
    scheduledAt: new Date('2026-11-03T10:00:00.000Z'),
  }) as unknown as QueueMessage

const at = <A, E>(minutes: number, effect: Effect.Effect<A, E>) => {
  vi.spyOn(Date, 'now').mockReturnValue(T0 + minutes * MINUTE)
  return Effect.runPromise(effect).finally(() => vi.restoreAllMocks())
}

const dequeued = async (minutes: number, queue: IMessageQueue) => {
  const result = await at(minutes, queue.dequeue)
  expect(result).not.toBeNull()
  return result as DequeuedMessage
}

type Op =
  | { readonly op: 'enqueue'; readonly t: number; readonly msg: QueueMessage }
  | { readonly op: 'dequeue'; readonly t: number }
  | { readonly op: 'ack'; readonly t: number; readonly nth: number }
  | { readonly op: 'refresh'; readonly t: number; readonly nth: number }
  | { readonly op: 'requeueStale'; readonly t: number }
  | { readonly op: 'drain'; readonly t: number }

interface Seed {
  readonly lists: Record<string, string[]>
  readonly zsets: Record<string, Record<string, number>>
}

const play = async (queue: IMessageQueue, ops: ReadonlyArray<Op>) => {
  const claims: string[] = []
  const results: unknown[] = []
  for (const o of ops) {
    switch (o.op) {
      case 'enqueue':
        results.push(await at(o.t, queue.enqueue(o.msg)))
        break
      case 'dequeue': {
        const result = await at(o.t, queue.dequeue)
        if (result) claims.push(result.claim)
        results.push(result?.message.id ?? null)
        break
      }
      case 'ack':
        results.push(await at(o.t, queue.ack(Array.getUnsafe(claims, o.nth))))
        break
      case 'refresh':
        results.push(
          await at(o.t, queue.refreshClaim(Array.getUnsafe(claims, o.nth)))
        )
        break
      case 'requeueStale':
        results.push(await at(o.t, queue.requeueStale(VISIBILITY_TIMEOUT)))
        break
      case 'drain':
        results.push(await at(o.t, queue.drainLegacyTopicLists))
        break
    }
  }
  return results
}

// Claims are random per dequeue, so state compares by what each key holds
// once the claim names are dropped.
const realState = async (redis: Redis) => {
  const keys = Array.sort(await redis.keys('*'), Order.String)
  const entries = await Promise.all(
    Array.map(keys, async (key) => {
      const type = await redis.type(key)
      if (type === 'list') return [key, await redis.lrange(key, 0, -1)] as const
      if (type === 'hash')
        return [key, Array.sort(await redis.hvals(key), Order.String)] as const
      const members = await redis.zrange(key, 0, '-1')
      const scores = await redis.zmscore(key, ...members)
      return [key, Array.sort(Array.map(scores, Number), Order.Number)] as const
    })
  )
  return Record.fromEntries(entries)
}

const fakeState = (
  lists: Record<string, string[]>,
  zsets: Record<string, Record<string, number>>,
  hashes: Record<string, Record<string, string>>
) =>
  Record.fromEntries(
    Array.sort(
      [
        ...Array.filter(
          Record.toEntries(lists),
          ([, entries]) => entries.length > 0
        ),
        ...Array.map(
          Array.filter(Record.toEntries(hashes), ([, h]) => Record.size(h) > 0),
          ([key, h]) =>
            [key, Array.sort(Record.values(h), Order.String)] as const
        ),
        ...Array.map(
          Array.filter(Record.toEntries(zsets), ([, z]) => Record.size(z) > 0),
          ([key, z]) =>
            [key, Array.sort(Record.values(z), Order.Number)] as const
        ),
      ],
      Order.mapInput(Order.String, ([key]: readonly [string, unknown]) => key)
    )
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

  const legacy = (id: string, topic: string) =>
    JSON.stringify(message(id, topic))
  const noSeed: Seed = { lists: {}, zsets: {} }
  const scenarios: ReadonlyArray<{
    readonly name: string
    readonly ops: ReadonlyArray<Op>
    readonly seed: Seed
  }> = [
    {
      name: 'the legacy drain over pending, processing and claimed keys',
      ops: [
        { op: 'enqueue', t: 0, msg: message('m1', 'watering_reminder') },
        { op: 'drain', t: 1 },
        { op: 'drain', t: 2 },
        { op: 'dequeue', t: 3 },
      ],
      seed: {
        lists: {
          'lily:notifications:watering_reminder': [
            legacy('w1', 'watering_reminder'),
            legacy('w2', 'watering_reminder'),
            legacy('w3', 'watering_reminder'),
          ],
          'lily:notifications:daily_tip:processing': [
            legacy('d1', 'daily_tip'),
            legacy('d2', 'daily_tip'),
          ],
        },
        zsets: {
          'lily:notifications:daily_tip:processing:claimed': {
            [legacy('d1', 'daily_tip')]: T0,
          },
        },
      },
    },
    {
      name: 'a stalled ack after a requeue',
      ops: [
        { op: 'enqueue', t: 0, msg: message('m1', 'watering_reminder') },
        { op: 'dequeue', t: 0 },
        { op: 'requeueStale', t: 11 },
        { op: 'dequeue', t: 11 },
        { op: 'ack', t: 12, nth: 0 },
      ],
      seed: noSeed,
    },
    {
      name: 'stale claims requeued oldest first, younger ones kept',
      ops: [
        { op: 'enqueue', t: 0, msg: message('m1', 'watering_reminder') },
        { op: 'enqueue', t: 0, msg: message('m2', 'new_follower') },
        { op: 'enqueue', t: 0, msg: message('m3', 'daily_tip') },
        { op: 'dequeue', t: 2 },
        { op: 'dequeue', t: 1 },
        { op: 'dequeue', t: 8 },
        { op: 'requeueStale', t: 12 },
        { op: 'dequeue', t: 12 },
        { op: 'dequeue', t: 12 },
        { op: 'dequeue', t: 12 },
      ],
      seed: noSeed,
    },
    {
      name: 'a claim exactly at the cutoff is requeued',
      ops: [
        { op: 'enqueue', t: 0, msg: message('m1', 'watering_reminder') },
        { op: 'dequeue', t: 0 },
        { op: 'requeueStale', t: 10 },
      ],
      seed: noSeed,
    },
    {
      name: 'refresh of a live and of an acked claim',
      ops: [
        { op: 'enqueue', t: 0, msg: message('m1', 'watering_reminder') },
        { op: 'enqueue', t: 0, msg: message('m2', 'weekly_recap') },
        { op: 'dequeue', t: 0 },
        { op: 'dequeue', t: 0 },
        { op: 'ack', t: 1, nth: 1 },
        { op: 'refresh', t: 5, nth: 0 },
        { op: 'refresh', t: 5, nth: 1 },
        { op: 'requeueStale', t: 12 },
      ],
      seed: noSeed,
    },
    {
      name: 'dequeue of an empty queue',
      ops: [
        { op: 'dequeue', t: 0 },
        { op: 'requeueStale', t: 30 },
      ],
      seed: noSeed,
    },
  ]

  it.each(scenarios)(
    'the in-memory fake matches real Redis: $name',
    async ({ ops, seed }) => {
      for (const [key, entries] of Record.toEntries(seed.lists))
        await redis.rpush(key, ...entries)
      for (const [key, members] of Record.toEntries(seed.zsets))
        for (const [member, score] of Record.toEntries(members))
          await redis.zadd(key, score, member)
      const realResults = await play(queue, ops)
      const real = await realState(redis)

      const lists = structuredClone(seed.lists)
      const zsets = structuredClone(seed.zsets)
      const hashes: Record<string, Record<string, string>> = {}
      const fake = createInMemoryRedis(lists, zsets, hashes)
      const fakeResults = await play(fake.queue, ops)

      expect(fakeResults).toEqual(realResults)
      expect(fakeState(lists, zsets, hashes)).toEqual(real)
    }
  )
})
