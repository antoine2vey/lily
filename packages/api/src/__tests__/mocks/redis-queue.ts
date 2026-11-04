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
  const live = (key: string) =>
    (lists[key]?.length ?? 0) > 0 || (sets[key]?.length ?? 0) > 0
  const redis = {
    lpush: (key: string, value: string) => {
      commands.push('lpush')
      return Promise.resolve(list(key).unshift(value))
    },
    eval: (script: string, _n: number, from: string, to: string) => {
      commands.push('eval')
      if (!script.includes('RPOPLPUSH')) {
        return Promise.reject(new Error('in-memory redis only runs dequeue'))
      }
      const raw = Option.fromNullishOr(list(from).pop())
      Option.map(raw, (entry) => list(to).unshift(entry))
      return Promise.resolve(Option.getOrNull(raw))
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
        lrem: (_key: string, _count: number, raw: string) => {
          acked.push(raw)
          return tx
        },
        zrem: () => tx,
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
