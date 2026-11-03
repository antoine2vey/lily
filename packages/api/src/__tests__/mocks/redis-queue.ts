import { makeRedisMessageQueue } from '@lily/api/services/message-queue/redis.provider'
import type Redis from 'ioredis'

export const createInMemoryRedisQueue = (entries: string[]) => {
  const acked: string[] = []
  const redis = {
    eval: () => Promise.resolve(entries.shift() ?? null),
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
  return { queue: makeRedisMessageQueue(redis), acked }
}
