import {
  createInMemoryRedis,
  createInMemoryRedisQueue,
} from '@lily/api/__tests__/mocks/redis-queue'
import { MAX_NOTIFICATION_IDS, QueueMessage } from '@lily/shared/server'
import { Array as Arr, Effect, Schema } from 'effect'
import { describe, expect, it } from 'vitest'

const validMessage = {
  id: 'msg-1',
  topic: 'delegation_request',
  payload: {
    userId: 'user-1',
    title: 'Care request',
    body: 'Bob wants you to care for their plants',
    notificationIds: ['5b0f3c1e-8a4d-4e2b-9c7a-1d2e3f4a5b6c'],
    plantIds: [],
    metadata: { delegationId: 'delegation-a' },
  },
  retryCount: 0,
  createdAt: '2026-11-03T10:00:00.000Z',
  scheduledAt: '2026-11-03T10:00:00.000Z',
}

const validEntry = JSON.stringify(validMessage)

const withMetadata = (topic: string, metadata: unknown) =>
  JSON.stringify({
    ...validMessage,
    topic,
    payload: { ...validMessage.payload, metadata },
  })

describe('makeRedisMessageQueue dequeue', () => {
  it('decodes an entry into a QueueMessage with dates and metadata', async () => {
    const { queue } = createInMemoryRedisQueue([validEntry])

    const result = await Effect.runPromise(queue.dequeue)

    expect(result?.rawData).toBe(validEntry)
    expect(result?.message.createdAt).toEqual(
      new Date('2026-11-03T10:00:00.000Z')
    )
    expect(result?.message.payload.metadata).toEqual({
      delegationId: 'delegation-a',
    })
  })

  it.each([
    ['daily_tip', {}, {}],
    [
      'new_follower',
      { senderId: 'ada', delegationId: 'delegation-a' },
      { senderId: 'ada' },
    ],
  ] as const)(
    'decodes %s metadata %j to the keys its topic defines',
    async (topic, metadata, decoded) => {
      const { queue } = createInMemoryRedisQueue([
        withMetadata(topic, metadata),
      ])

      const result = await Effect.runPromise(queue.dequeue)

      expect(result?.message.payload.metadata).toEqual(decoded)
    }
  )

  it.each([
    ['a non-JSON string', 'not json'],
    ['JSON that is not a message', JSON.stringify({ id: 'msg-1' })],
    [
      'a message whose topic is not a notification topic',
      JSON.stringify({ ...validMessage, topic: 'bogus_topic' }),
    ],
    [
      'a message without a payload',
      JSON.stringify({ id: 'msg-1', topic: 'new_follower', retryCount: 0 }),
    ],
    [
      'an id holding a NUL',
      JSON.stringify({ ...validMessage, id: 'm\u0000x' }),
    ],
    [
      'an id holding an unpaired surrogate',
      JSON.stringify({ ...validMessage, id: 'm\ud800' }),
    ],
    [
      'notification ids that are not UUIDs',
      JSON.stringify({
        ...validMessage,
        payload: { ...validMessage.payload, notificationIds: ['nope'] },
      }),
    ],
    [
      `more than ${MAX_NOTIFICATION_IDS} notification ids`,
      JSON.stringify({
        ...validMessage,
        payload: {
          ...validMessage.payload,
          notificationIds: Arr.makeBy(MAX_NOTIFICATION_IDS + 1, () =>
            crypto.randomUUID()
          ),
        },
      }),
    ],
    ...Arr.map([1e20, 1.5, -1], (retryCount): [string, string] => [
      `a retry count of ${retryCount}`,
      JSON.stringify({ ...validMessage, retryCount }),
    ]),
    ...Arr.map(
      [
        ['delegation_request', { delegationId: '' }],
        ['new_follower', { senderId: '' }],
        ['delegation_request', { delegationId: 5 }],
        ['delegation_request', 'abc'],
        ['delegation_request', [1, 2]],
        ['new_follower', { delegationId: 'delegation-a' }],
        ['daily_tip', { delegationId: 'delegation-a' }],
        ['daily_tip', 5],
      ] as const,
      ([topic, metadata]): [string, string] => [
        `a ${topic} whose metadata is ${JSON.stringify(metadata)}`,
        withMetadata(topic, metadata),
      ]
    ),
  ])(
    'fails %s with the raw text so the consumer can ack it',
    async (_, raw) => {
      const { queue } = createInMemoryRedisQueue([raw])

      const error = await Effect.runPromise(Effect.flip(queue.dequeue))

      expect(error).toMatchObject({
        _tag: 'QueueMessageDecodeError',
        rawData: raw,
      })
    }
  )

  it('returns null for an empty queue', async () => {
    const { queue } = createInMemoryRedisQueue([])

    expect(await Effect.runPromise(queue.dequeue)).toBeNull()
  })
})

const decodeMessage = Schema.decodeUnknownSync(
  Schema.fromJsonString(QueueMessage)
)

describe('makeRedisMessageQueue one queue', () => {
  it('carries every topic through one key and hands each message back with its own topic', async () => {
    const { queue, liveKeys } = createInMemoryRedis()
    const sent = Arr.map(
      [
        ['watering_reminder', {}],
        ['new_follower', { senderId: 'ada' }],
        ['daily_tip', {}],
      ] as const,
      ([topic, metadata]) => decodeMessage(withMetadata(topic, metadata))
    )

    await Effect.runPromise(Effect.forEach(sent, queue.enqueue))
    expect(liveKeys()).toEqual(['lily:queue:notifications'])

    // A message that comes back under another topic may no longer decode;
    // that still counts as a wrong message, not a crash.
    const received = await Effect.runPromise(
      Effect.forEach(sent, () =>
        queue.dequeue.pipe(
          Effect.map((r) => r?.message),
          Effect.catchTag('QueueMessageDecodeError', (e) =>
            Effect.succeed(e.rawData)
          )
        )
      )
    )

    expect(received).toEqual(sent)
    expect(await Effect.runPromise(queue.dequeue)).toBeNull()
  })
})
