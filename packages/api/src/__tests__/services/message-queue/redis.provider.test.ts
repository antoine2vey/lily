import { createInMemoryRedisQueue } from '@lily/api/__tests__/mocks/redis-queue'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

const validEntry = JSON.stringify({
  id: 'msg-1',
  topic: 'delegation_request',
  payload: {
    userId: 'user-1',
    title: 'Care request',
    body: 'Bob wants you to care for their plants',
    notificationIds: ['notification-1'],
    plantIds: [],
    metadata: { delegationId: 'delegation-a' },
  },
  retryCount: 0,
  createdAt: '2026-11-03T10:00:00.000Z',
  scheduledAt: '2026-11-03T10:00:00.000Z',
})

describe('makeRedisMessageQueue dequeue', () => {
  it('decodes an entry into a QueueMessage with dates and metadata', async () => {
    const { queue } = createInMemoryRedisQueue([validEntry])

    const result = await Effect.runPromise(queue.dequeue('delegation_request'))

    expect(result?.rawData).toBe(validEntry)
    expect(result?.message.createdAt).toEqual(
      new Date('2026-11-03T10:00:00.000Z')
    )
    expect(result?.message.payload.metadata).toEqual({
      delegationId: 'delegation-a',
    })
  })

  it.each([
    ['a non-JSON string', 'not json'],
    ['JSON that is not a message', JSON.stringify({ id: 'msg-1' })],
    [
      'a message whose topic is not a notification topic',
      JSON.stringify({ ...JSON.parse(validEntry), topic: 'bogus_topic' }),
    ],
    [
      'a message without a payload',
      JSON.stringify({ id: 'msg-1', topic: 'new_follower', retryCount: 0 }),
    ],
  ])(
    'fails %s with the raw text so the consumer can ack it',
    async (_, raw) => {
      const { queue } = createInMemoryRedisQueue([raw])

      const error = await Effect.runPromise(
        Effect.flip(queue.dequeue('new_follower'))
      )

      expect(error).toMatchObject({
        _tag: 'QueueMessageDecodeError',
        topic: 'new_follower',
        rawData: raw,
      })
    }
  )

  it('returns null for an empty topic', async () => {
    const { queue } = createInMemoryRedisQueue([])

    expect(await Effect.runPromise(queue.dequeue('new_follower'))).toBeNull()
  })
})
