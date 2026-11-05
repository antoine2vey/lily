import {
  DEQUEUE_SCRIPT,
  makeRedisMessageQueue,
  REQUEUE_STALE_SCRIPT,
} from '@lily/api/services/message-queue/redis.provider'
import { Array, Option, Order, Record } from 'effect'
import type Redis from 'ioredis'

export const createInMemoryRedis = (
  lists: Record<string, string[]> = {},
  zsets: Record<string, Record<string, number>> = {},
  hashes: Record<string, Record<string, string>> = {}
) => {
  const acked: string[] = []
  const commands: string[] = []
  const list = (key: string) => {
    lists[key] ??= []
    return lists[key]
  }
  const zset = (key: string) => {
    zsets[key] ??= {}
    return zsets[key]
  }
  const hash = (key: string) => {
    hashes[key] ??= {}
    return hashes[key]
  }
  const live = (key: string) =>
    (lists[key]?.length ?? 0) > 0 ||
    Record.size(zsets[key] ?? {}) > 0 ||
    Record.size(hashes[key] ?? {}) > 0
  const byScore = Order.combine(
    Order.mapInput(
      Order.Number,
      ([, score]: readonly [string, number]) => score
    ),
    Order.mapInput(
      Order.String,
      ([member]: readonly [string, number]) => member
    )
  )
  const redis = {
    lpush: (key: string, value: string) => {
      commands.push('lpush')
      return Promise.resolve(list(key).unshift(value))
    },
    eval: (
      script: string,
      _n: number,
      queueKey: string,
      inFlightKey: string,
      claimedAtKey: string,
      ...args: ReadonlyArray<number | string>
    ) => {
      commands.push('eval')
      if (script === DEQUEUE_SCRIPT) {
        const [now, claim] = args
        const raw = Option.fromNullishOr(list(queueKey).pop())
        Option.map(raw, (entry) => {
          hash(inFlightKey)[String(claim)] = entry
          zset(claimedAtKey)[String(claim)] = Number(now)
        })
        return Promise.resolve(Option.getOrNull(raw))
      }
      if (script === REQUEUE_STALE_SCRIPT) {
        const stale = Array.sort(
          Array.filter(
            Record.toEntries(zset(claimedAtKey)),
            ([, claimedAt]) => claimedAt <= Number(args[0])
          ),
          byScore
        )
        const entries = Array.getSomes(
          Array.map(stale, ([claim]) =>
            Option.fromNullishOr(hash(inFlightKey)[claim])
          )
        )
        list(queueKey).push(...entries)
        Array.forEach(stale, ([claim]) => {
          delete hash(inFlightKey)[claim]
          delete zset(claimedAtKey)[claim]
        })
        return Promise.resolve(entries.length)
      }
      return Promise.reject(new Error('in-memory redis has no such script'))
    },
    zadd: (key: string, _xx: 'XX', score: number, member: string) => {
      commands.push('zadd')
      if (member in zset(key)) zset(key)[member] = score
      return Promise.resolve(0)
    },
    exists: (...keys: string[]) => {
      commands.push('exists')
      return Promise.resolve(Array.filter(keys, live).length)
    },
    lpop: (key: string) => {
      commands.push('lpop')
      return Promise.resolve(
        Option.getOrNull(Option.fromNullishOr(list(key).shift()))
      )
    },
    del: (...keys: string[]) => {
      commands.push('del')
      const removed = Array.filter(keys, live).length
      Array.forEach(keys, (key) => {
        delete lists[key]
        delete zsets[key]
        delete hashes[key]
      })
      return Promise.resolve(removed)
    },
    multi: () => {
      const tx = {
        hdel: (key: string, claim: string) => {
          Option.map(Option.fromNullishOr(hash(key)[claim]), (raw) =>
            acked.push(raw)
          )
          delete hash(key)[claim]
          return tx
        },
        zrem: (key: string, claim: string) => {
          delete zset(key)[claim]
          return tx
        },
        exec: () => Promise.resolve([]),
      }
      return tx
    },
  } as unknown as Redis
  const liveKeys = () =>
    Array.filter(
      Array.dedupe([
        ...Object.keys(lists),
        ...Object.keys(zsets),
        ...Object.keys(hashes),
      ]),
      live
    ).sort()
  return { queue: makeRedisMessageQueue(redis), acked, commands, liveKeys }
}

export const createInMemoryRedisQueue = (entries: string[]) =>
  createInMemoryRedis({
    'lily:queue:notifications': Array.reverse(entries),
  })
