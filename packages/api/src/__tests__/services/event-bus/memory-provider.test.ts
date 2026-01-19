import { InMemoryEventBusLive } from '@lily/api/services/event-bus/memory.provider'
import type { AppEvent } from '@lily/shared/server'
import { EventBus } from '@lily/shared/server'
import { Effect, Queue } from 'effect'
import { describe, expect, it } from 'vitest'

describe('InMemoryEventBus', () => {
  describe('publish', () => {
    it('should publish event successfully', async () => {
      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const eventBus = yield* EventBus
          yield* eventBus.publish({
            _tag: 'PlantCreated',
            userId: 'user-1',
            plantId: 'plant-1',
          })
        }).pipe(Effect.provide(InMemoryEventBusLive))
      )

      expect(result._tag).toBe('Success')
    })

    it('should publish multiple events', async () => {
      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const eventBus = yield* EventBus
          yield* eventBus.publish({
            _tag: 'PlantCreated',
            userId: 'user-1',
            plantId: 'plant-1',
          })
          yield* eventBus.publish({
            _tag: 'CareLogCreated',
            userId: 'user-1',
            plantId: 'plant-1',
            careLogId: 'care-log-1',
            type: 'watering',
          })
          yield* eventBus.publish({
            _tag: 'PhotoUploaded',
            userId: 'user-1',
            plantId: 'plant-1',
            photoId: 'photo-1',
          })
        }).pipe(Effect.provide(InMemoryEventBusLive))
      )

      expect(result._tag).toBe('Success')
    })
  })

  describe('subscribe', () => {
    it('should receive published events', async () => {
      const events: AppEvent[] = []

      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const eventBus = yield* EventBus

            // Subscribe first
            const queue = yield* eventBus.subscribe

            // Publish an event
            yield* eventBus.publish({
              _tag: 'PlantCreated',
              userId: 'user-1',
              plantId: 'plant-1',
            })

            // Take the event from queue
            const event = yield* Queue.take(queue)
            events.push(event)
          })
        ).pipe(Effect.provide(InMemoryEventBusLive))
      )

      expect(events).toHaveLength(1)
      expect(events[0]?._tag).toBe('PlantCreated')
    })

    it('should handle different event types', async () => {
      const events: AppEvent[] = []

      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const eventBus = yield* EventBus
            const queue = yield* eventBus.subscribe

            // Publish different event types
            yield* eventBus.publish({
              _tag: 'PlantCreated',
              userId: 'user-1',
              plantId: 'plant-1',
            })

            yield* eventBus.publish({
              _tag: 'CareLogCreated',
              userId: 'user-1',
              plantId: 'plant-1',
              careLogId: 'care-1',
              type: 'fertilization',
            })

            // Collect events
            const event1 = yield* Queue.take(queue)
            const event2 = yield* Queue.take(queue)
            events.push(event1, event2)
          })
        ).pipe(Effect.provide(InMemoryEventBusLive))
      )

      expect(events).toHaveLength(2)
      expect(events[0]?._tag).toBe('PlantCreated')
      expect(events[1]?._tag).toBe('CareLogCreated')
    })
  })

  describe('publish/subscribe integration', () => {
    it('should maintain event order', async () => {
      const receivedEvents: AppEvent[] = []

      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const eventBus = yield* EventBus
            const queue = yield* eventBus.subscribe

            // Publish events in order
            for (let i = 1; i <= 5; i++) {
              yield* eventBus.publish({
                _tag: 'PlantCreated',
                userId: 'user-1',
                plantId: `plant-${i}`,
              })
            }

            // Collect all events
            for (let i = 0; i < 5; i++) {
              const event = yield* Queue.take(queue)
              receivedEvents.push(event)
            }
          })
        ).pipe(Effect.provide(InMemoryEventBusLive))
      )

      expect(receivedEvents).toHaveLength(5)
      // Verify order
      for (let i = 0; i < 5; i++) {
        const event = receivedEvents[i]
        if (event?._tag === 'PlantCreated') {
          expect(event.plantId).toBe(`plant-${i + 1}`)
        }
      }
    })

    it('should support all app event types', async () => {
      const allEventTypes: AppEvent['_tag'][] = []

      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const eventBus = yield* EventBus
            const queue = yield* eventBus.subscribe

            const eventsToPublish: AppEvent[] = [
              { _tag: 'PlantCreated', userId: 'u1', plantId: 'p1' },
              {
                _tag: 'CareLogCreated',
                userId: 'u1',
                plantId: 'p1',
                careLogId: 'c1',
                type: 'watering',
              },
              {
                _tag: 'ChatMessageSent',
                userId: 'u1',
                plantId: 'p1',
                messageId: 'm1',
              },
              {
                _tag: 'PhotoUploaded',
                userId: 'u1',
                plantId: 'p1',
                photoId: 'ph1',
              },
              { _tag: 'PlantScanned', userId: 'u1', scanId: 's1' },
              { _tag: 'AttentionResponded', userId: 'u1', plantId: 'p1' },
              { _tag: 'CareHistoryViewed', userId: 'u1' },
            ]

            for (const event of eventsToPublish) {
              yield* eventBus.publish(event)
            }

            for (let i = 0; i < eventsToPublish.length; i++) {
              const event = yield* Queue.take(queue)
              allEventTypes.push(event._tag)
            }
          })
        ).pipe(Effect.provide(InMemoryEventBusLive))
      )

      expect(allEventTypes).toContain('PlantCreated')
      expect(allEventTypes).toContain('CareLogCreated')
      expect(allEventTypes).toContain('ChatMessageSent')
      expect(allEventTypes).toContain('PhotoUploaded')
      expect(allEventTypes).toContain('PlantScanned')
      expect(allEventTypes).toContain('AttentionResponded')
      expect(allEventTypes).toContain('CareHistoryViewed')
    })
  })
})
