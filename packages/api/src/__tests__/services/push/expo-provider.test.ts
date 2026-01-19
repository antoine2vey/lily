import {
  createFailingPushService,
  createMockPushService,
  createSuccessPushService,
} from '@lily/api/__tests__/mocks/push.service'
import type { PushMessage } from '@lily/shared/server'
import { PushService } from '@lily/shared/server'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'

describe('PushService (mock)', () => {
  describe('send', () => {
    it('should send push notification successfully', async () => {
      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const pushService = yield* PushService
          return yield* pushService.send({
            to: 'ExponentPushToken[abc123]',
            title: 'Test Title',
            body: 'Test body content',
          })
        }).pipe(Effect.provide(createSuccessPushService()))
      )

      expect(result._tag).toBe('Success')
    })

    it('should return ticket with ok status on success', async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const pushService = yield* PushService
          return yield* pushService.send({
            to: 'ExponentPushToken[abc123]',
            title: 'Test',
            body: 'Test',
          })
        }).pipe(Effect.provide(createSuccessPushService()))
      )

      expect(result.status).toBe('ok')
      expect(result.id).toBeDefined()
    })

    it('should fail with PushSendError when configured to fail', async () => {
      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const pushService = yield* PushService
          return yield* pushService.send({
            to: 'ExponentPushToken[abc123]',
            title: 'Test',
            body: 'Test',
          })
        }).pipe(Effect.provide(createFailingPushService('Connection refused')))
      )

      expect(result._tag).toBe('Failure')
    })

    it('should call onSend callback with message', async () => {
      let capturedMessage: PushMessage | null = null

      await Effect.runPromise(
        Effect.gen(function* () {
          const pushService = yield* PushService
          return yield* pushService.send({
            to: 'ExponentPushToken[test]',
            title: 'Captured Title',
            body: 'Captured Body',
          })
        }).pipe(
          Effect.provide(
            createMockPushService({
              onSend: (msg) => {
                capturedMessage = msg
              },
            })
          )
        )
      )

      expect(capturedMessage).not.toBeNull()
      expect(capturedMessage?.title).toBe('Captured Title')
      expect(capturedMessage?.body).toBe('Captured Body')
    })

    it('should include optional data in message', async () => {
      let capturedMessage: PushMessage | null = null

      await Effect.runPromise(
        Effect.gen(function* () {
          const pushService = yield* PushService
          return yield* pushService.send({
            to: 'ExponentPushToken[test]',
            title: 'With Data',
            body: 'Has extra data',
            data: { plantId: 'plant-1', action: 'water' },
          })
        }).pipe(
          Effect.provide(
            createMockPushService({
              onSend: (msg) => {
                capturedMessage = msg
              },
            })
          )
        )
      )

      expect(capturedMessage?.data).toEqual({
        plantId: 'plant-1',
        action: 'water',
      })
    })

    it('should include sound option when provided', async () => {
      let capturedMessage: PushMessage | null = null

      await Effect.runPromise(
        Effect.gen(function* () {
          const pushService = yield* PushService
          return yield* pushService.send({
            to: 'ExponentPushToken[test]',
            title: 'With Sound',
            body: 'Ding!',
            sound: 'default',
          })
        }).pipe(
          Effect.provide(
            createMockPushService({
              onSend: (msg) => {
                capturedMessage = msg
              },
            })
          )
        )
      )

      expect(capturedMessage?.sound).toBe('default')
    })

    it('should include badge count when provided', async () => {
      let capturedMessage: PushMessage | null = null

      await Effect.runPromise(
        Effect.gen(function* () {
          const pushService = yield* PushService
          return yield* pushService.send({
            to: 'ExponentPushToken[test]',
            title: 'Badge',
            body: 'New notification',
            badge: 5,
          })
        }).pipe(
          Effect.provide(
            createMockPushService({
              onSend: (msg) => {
                capturedMessage = msg
              },
            })
          )
        )
      )

      expect(capturedMessage?.badge).toBe(5)
    })
  })

  describe('sendBatch', () => {
    it('should send batch of notifications successfully', async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const pushService = yield* PushService
          return yield* pushService.sendBatch([
            {
              to: 'ExponentPushToken[user1]',
              title: 'Batch 1',
              body: 'Message 1',
            },
            {
              to: 'ExponentPushToken[user2]',
              title: 'Batch 2',
              body: 'Message 2',
            },
            {
              to: 'ExponentPushToken[user3]',
              title: 'Batch 3',
              body: 'Message 3',
            },
          ])
        }).pipe(Effect.provide(createSuccessPushService()))
      )

      expect(result).toHaveLength(3)
      expect(result[0]?.status).toBe('ok')
      expect(result[1]?.status).toBe('ok')
      expect(result[2]?.status).toBe('ok')
    })

    it('should fail batch when configured to fail', async () => {
      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const pushService = yield* PushService
          return yield* pushService.sendBatch([
            { to: 'ExponentPushToken[user1]', title: 'Test', body: 'Test' },
          ])
        }).pipe(Effect.provide(createFailingPushService()))
      )

      expect(result._tag).toBe('Failure')
    })

    it('should call onSendBatch callback with all messages', async () => {
      let capturedMessages: PushMessage[] = []

      await Effect.runPromise(
        Effect.gen(function* () {
          const pushService = yield* PushService
          return yield* pushService.sendBatch([
            { to: 'ExponentPushToken[a]', title: 'A', body: 'A' },
            { to: 'ExponentPushToken[b]', title: 'B', body: 'B' },
          ])
        }).pipe(
          Effect.provide(
            createMockPushService({
              onSendBatch: (msgs) => {
                capturedMessages = msgs
              },
            })
          )
        )
      )

      expect(capturedMessages).toHaveLength(2)
      expect(capturedMessages[0]?.title).toBe('A')
      expect(capturedMessages[1]?.title).toBe('B')
    })

    it('should return empty array for empty batch', async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const pushService = yield* PushService
          return yield* pushService.sendBatch([])
        }).pipe(Effect.provide(createSuccessPushService()))
      )

      expect(result).toHaveLength(0)
    })

    it('should generate unique ticket IDs for each message', async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const pushService = yield* PushService
          return yield* pushService.sendBatch([
            { to: 'ExponentPushToken[a]', title: 'A', body: 'A' },
            { to: 'ExponentPushToken[b]', title: 'B', body: 'B' },
            { to: 'ExponentPushToken[c]', title: 'C', body: 'C' },
          ])
        }).pipe(Effect.provide(createSuccessPushService()))
      )

      const ids = result.map((t) => t.id)
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(3)
    })
  })
})
