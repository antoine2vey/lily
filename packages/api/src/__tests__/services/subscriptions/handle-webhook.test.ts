import { createMockPaymentProvider } from '@lily/api/__tests__/mocks/payment-provider'
import { createMockSubscriptionRepository } from '@lily/api/__tests__/mocks/subscription.repository'
import type { WebhookEvent } from '@lily/api/services/subscriptions/payment-provider.interface'
import {
  SubscriptionService,
  SubscriptionServiceLive,
} from '@lily/api/services/subscriptions/service'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('handleWebhookEvent', () => {
  const createTestLayer = (
    options: {
      webhookEvent?: WebhookEvent
      shouldFailWebhook?: boolean
      subscriptionDetails?: {
        status: string
        currentPeriodStart: Date
        currentPeriodEnd: Date
        trialStart?: Date
        trialEnd?: Date
        customerId: string
      }
    } = {}
  ) =>
    SubscriptionServiceLive.pipe(
      Layer.provide(
        Layer.mergeAll(
          createMockSubscriptionRepository(),
          createMockPaymentProvider({
            ...(options.webhookEvent !== undefined && {
              webhookEvent: options.webhookEvent,
            }),
            ...(options.shouldFailWebhook !== undefined && {
              shouldFailWebhook: options.shouldFailWebhook,
            }),
            ...(options.subscriptionDetails !== undefined && {
              subscriptionDetails: options.subscriptionDetails,
            }),
          })
        )
      )
    )

  describe('checkout.session.completed', () => {
    it('should create subscription on checkout completed', async () => {
      const webhookEvent: WebhookEvent = {
        type: 'checkout.session.completed',
        data: {
          object: {
            metadata: { userId: 'user-1' },
            subscription: 'sub_test_123',
            customer: 'cus_test_123',
          },
        },
      }

      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const service = yield* SubscriptionService
          yield* service.handleWebhookEvent('payload', 'signature')
        }).pipe(Effect.provide(createTestLayer({ webhookEvent })))
      )

      expect(result._tag).toBe('Success')
    })

    it('should handle checkout completed with trial', async () => {
      const trialEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      const webhookEvent: WebhookEvent = {
        type: 'checkout.session.completed',
        data: {
          object: {
            metadata: { userId: 'user-1' },
            subscription: 'sub_test_456',
            customer: 'cus_test_456',
          },
        },
      }

      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const service = yield* SubscriptionService
          yield* service.handleWebhookEvent('payload', 'signature')
        }).pipe(
          Effect.provide(
            createTestLayer({
              webhookEvent,
              subscriptionDetails: {
                status: 'trialing',
                currentPeriodStart: new Date(),
                currentPeriodEnd: trialEnd,
                trialStart: new Date(),
                trialEnd,
                customerId: 'cus_test_456',
              },
            })
          )
        )
      )

      expect(result._tag).toBe('Success')
    })
  })

  describe('customer.subscription.updated', () => {
    it('should update subscription on subscription updated', async () => {
      const webhookEvent: WebhookEvent = {
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_test_123',
            status: 'active',
            current_period_start: Math.floor(Date.now() / 1000),
            current_period_end:
              Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
            metadata: { userId: 'user-1' },
          },
        },
      }

      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const service = yield* SubscriptionService
          yield* service.handleWebhookEvent('payload', 'signature')
        }).pipe(Effect.provide(createTestLayer({ webhookEvent })))
      )

      expect(result._tag).toBe('Success')
    })

    it('should handle trial start update', async () => {
      const webhookEvent: WebhookEvent = {
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_test_123',
            status: 'trialing',
            current_period_start: Math.floor(Date.now() / 1000),
            current_period_end:
              Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
            trial_start: Math.floor(Date.now() / 1000),
            trial_end: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
            metadata: { userId: 'user-1' },
          },
        },
      }

      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const service = yield* SubscriptionService
          yield* service.handleWebhookEvent('payload', 'signature')
        }).pipe(Effect.provide(createTestLayer({ webhookEvent })))
      )

      expect(result._tag).toBe('Success')
    })
  })

  describe('customer.subscription.deleted', () => {
    it('should mark subscription as canceled on deletion', async () => {
      const webhookEvent: WebhookEvent = {
        type: 'customer.subscription.deleted',
        data: {
          object: {
            id: 'sub_test_123',
            metadata: { userId: 'user-1' },
          },
        },
      }

      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const service = yield* SubscriptionService
          yield* service.handleWebhookEvent('payload', 'signature')
        }).pipe(Effect.provide(createTestLayer({ webhookEvent })))
      )

      expect(result._tag).toBe('Success')
    })
  })

  describe('invoice.payment_failed', () => {
    it('should update to past_due on payment failure', async () => {
      const webhookEvent: WebhookEvent = {
        type: 'invoice.payment_failed',
        data: {
          object: {
            subscription: 'sub_test_123',
            metadata: { userId: 'user-1' },
          },
        },
      }

      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const service = yield* SubscriptionService
          yield* service.handleWebhookEvent('payload', 'signature')
        }).pipe(Effect.provide(createTestLayer({ webhookEvent })))
      )

      expect(result._tag).toBe('Success')
    })
  })

  describe('error handling', () => {
    it('should fail with invalid webhook signature', async () => {
      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const service = yield* SubscriptionService
          yield* service.handleWebhookEvent('payload', 'invalid-signature')
        }).pipe(Effect.provide(createTestLayer({ shouldFailWebhook: true })))
      )

      expect(result._tag).toBe('Failure')
    })

    it('should ignore unknown event types', async () => {
      const webhookEvent: WebhookEvent = {
        type: 'unknown.event.type',
        data: {
          object: {},
        },
      }

      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const service = yield* SubscriptionService
          yield* service.handleWebhookEvent('payload', 'signature')
        }).pipe(Effect.provide(createTestLayer({ webhookEvent })))
      )

      // Should succeed but not do anything
      expect(result._tag).toBe('Success')
    })
  })

  describe('event handling edge cases', () => {
    it('should handle missing metadata in checkout completed', async () => {
      const webhookEvent: WebhookEvent = {
        type: 'checkout.session.completed',
        data: {
          object: {
            // No metadata or userId
            subscription: 'sub_test_123',
            customer: 'cus_test_123',
          },
        },
      }

      // Should not fail, just skip processing
      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const service = yield* SubscriptionService
          yield* service.handleWebhookEvent('payload', 'signature')
        }).pipe(Effect.provide(createTestLayer({ webhookEvent })))
      )

      expect(result._tag).toBe('Success')
    })

    it('should handle missing subscription in checkout completed', async () => {
      const webhookEvent: WebhookEvent = {
        type: 'checkout.session.completed',
        data: {
          object: {
            metadata: { userId: 'user-1' },
            // No subscription
            customer: 'cus_test_123',
          },
        },
      }

      const result = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const service = yield* SubscriptionService
          yield* service.handleWebhookEvent('payload', 'signature')
        }).pipe(Effect.provide(createTestLayer({ webhookEvent })))
      )

      // Should succeed but skip processing
      expect(result._tag).toBe('Success')
    })
  })
})
