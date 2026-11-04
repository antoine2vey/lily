import { makeRedisMessageQueue } from '@lily/api/services/message-queue/redis.provider'
import { Array, Option } from 'effect'
import type Redis from 'ioredis'

export const createInMemoryRedis = (
  lists: Record<string, string[]> = {},
  sets: Record<string, string[]> = {}
) => {
  const acked: string[] = []
  const commands: string[] = []
  const list = (key: string) => {
    lists[key] ??= []
    return lists[key]
  }
  const set = (key: string) => {
    sets[key] ??= []
    return sets[key]
  }
  const remove = (values: string[], value: string) => {
    const index = values.indexOf(value)
    if (index >= 0) values.splice(index, 1)
  }
  const claimedAt = new Map<string, number>()
  const live = (key: string) =>
    (lists[key]?.length ?? 0) > 0 || (sets[key]?.length ?? 0) > 0
  const redis = {
    lpush: (key: string, value: string) => {
      commands.push('lpush')
      return Promise.resolve(list(key).unshift(value))
    },
    eval: (
      script: string,
      _n: number,
      queueKey: string,
      processingKey: string,
      claimedKey: string,
      arg: number
    ) => {
      commands.push('eval')
      const claimed = set(claimedKey)
      if (script.includes('RPOPLPUSH')) {
        const raw = Option.fromNullishOr(list(queueKey).pop())
        Option.map(raw, (entry) => {
          list(processingKey).unshift(entry)
          claimed.push(entry)
          claimedAt.set(entry, arg)
        })
        return Promise.resolve(Option.getOrNull(raw))
      }
      if (script.includes('LRANGE')) {
        const stale = Array.filter(
          list(processingKey),
          (raw) => (claimedAt.get(raw) ?? Number.NEGATIVE_INFINITY) <= arg
        )
        Array.forEach(stale, (raw) => {
          remove(list(processingKey), raw)
          remove(claimed, raw)
          claimedAt.delete(raw)
          list(queueKey).push(raw)
        })
        return Promise.resolve(stale.length)
      }
      return Promise.reject(new Error('in-memory redis has no such script'))
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
        delete sets[key]
      })
      return Promise.resolve(removed)
    },
    multi: () => {
      const tx = {
        lrem: (key: string, _count: number, raw: string) => {
          acked.push(raw)
          remove(list(key), raw)
          return tx
        },
        zrem: (key: string, raw: string) => {
          remove(set(key), raw)
          claimedAt.delete(raw)
          return tx
        },
        exec: () => Promise.resolve([]),
      }
      return tx
    },
  } as unknown as Redis
  const liveKeys = () =>
    Array.filter([...Object.keys(lists), ...Object.keys(sets)], live).sort()
  return { queue: makeRedisMessageQueue(redis), acked, commands, liveKeys }
}

export const createInMemoryRedisQueue = (entries: string[]) =>
  createInMemoryRedis({
    'lily:queue:notifications': Array.reverse(entries),
  })
