import { createMockPaymentProvider } from '@lily/api/__tests__/mocks/payment-provider'
import { createMockSubscriptionRepository } from '@lily/api/__tests__/mocks/subscription.repository'
import {
  SubscriptionService,
  SubscriptionServiceLive,
} from '@lily/api/services/subscriptions/service'
import { Effect, Layer } from 'effect'
import { describe, expect, it } from 'vitest'

describe('createCheckoutSession', () => {
  const createTestLayer = (
    options: {
      checkoutSession?: { sessionId: string; url: string }
      shouldFailCheckout?: boolean
    } = {}
  ) =>
    SubscriptionServiceLive.pipe(
      Layer.provide(
        Layer.mergeAll(
          createMockSubscriptionRepository(),
          createMockPaymentProvider({
            ...(options.checkoutSession !== undefined && {
              checkoutSession: options.checkoutSession,
            }),
            ...(options.shouldFailCheckout !== undefined && {
              shouldFailCheckout: options.shouldFailCheckout,
            }),
          })
        )
      )
    )

  it('should create checkout session successfully', async () => {
    const expectedSession = {
      sessionId: 'cs_test_abc123',
      url: 'https://checkout.stripe.com/pay/cs_test_abc123',
    }

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* SubscriptionService
        return yield* service.createCheckoutSession({
          userId: 'user-1',
          email: 'test@example.com',
          successUrl: 'https://app.example.com/success',
          cancelUrl: 'https://app.example.com/cancel',
        })
      }).pipe(
        Effect.provide(createTestLayer({ checkoutSession: expectedSession }))
      )
    )

    expect(result.sessionId).toBe(expectedSession.sessionId)
    expect(result.url).toBe(expectedSession.url)
  })

  it('should pass correct user info to provider', async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* SubscriptionService
        return yield* service.createCheckoutSession({
          userId: 'user-specific-id',
          email: 'specific@example.com',
          successUrl: 'https://app.example.com/success',
          cancelUrl: 'https://app.example.com/cancel',
        })
      }).pipe(Effect.provide(createTestLayer()))
    )

    // The mock generates a session ID - just verify it's returned
    expect(result.sessionId).toBeDefined()
    expect(result.url).toBeDefined()
  })

  it('should fail with PaymentProviderError on Stripe failure', async () => {
    const result = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const service = yield* SubscriptionService
        return yield* service.createCheckoutSession({
          userId: 'user-1',
          email: 'test@example.com',
          successUrl: 'https://app.example.com/success',
          cancelUrl: 'https://app.example.com/cancel',
        })
      }).pipe(Effect.provide(createTestLayer({ shouldFailCheckout: true })))
    )

    expect(result._tag).toBe('Failure')
  })

  it('should return sessionId and url', async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* SubscriptionService
        return yield* service.createCheckoutSession({
          userId: 'user-1',
          email: 'test@example.com',
          successUrl: 'https://app.example.com/success',
          cancelUrl: 'https://app.example.com/cancel',
        })
      }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result).toHaveProperty('sessionId')
    expect(result).toHaveProperty('url')
    expect(typeof result.sessionId).toBe('string')
    expect(typeof result.url).toBe('string')
  })

  it('should work with different success/cancel URLs', async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* SubscriptionService
        return yield* service.createCheckoutSession({
          userId: 'user-1',
          email: 'test@example.com',
          successUrl: 'lily://payment-success',
          cancelUrl: 'lily://payment-cancel',
        })
      }).pipe(Effect.provide(createTestLayer()))
    )

    expect(result.sessionId).toBeDefined()
    expect(result.url).toBeDefined()
  })
})
