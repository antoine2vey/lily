import type { PaymentProviderError } from '@lily/shared'
import { Context, type Effect } from 'effect'

export interface CreateCheckoutSessionParams {
  userId: string
  email: string
  successUrl: string
  cancelUrl: string
  trialDays?: number
}

export interface CreateCheckoutSessionResult {
  sessionId: string
  url: string
}

export interface WebhookEvent {
  type: string
  data: {
    object: Record<string, unknown>
  }
}

export interface IPaymentProvider {
  readonly createCheckoutSession: (
    params: CreateCheckoutSessionParams
  ) => Effect.Effect<CreateCheckoutSessionResult, PaymentProviderError>

  readonly cancelSubscription: (
    externalSubscriptionId: string
  ) => Effect.Effect<void, PaymentProviderError>

  readonly constructWebhookEvent: (
    payload: string,
    signature: string
  ) => Effect.Effect<WebhookEvent, PaymentProviderError>

  readonly getSubscriptionDetails: (
    externalSubscriptionId: string
  ) => Effect.Effect<
    {
      status: string
      currentPeriodStart: Date
      currentPeriodEnd: Date
      trialStart?: Date
      trialEnd?: Date
      customerId: string
    },
    PaymentProviderError
  >
}

export class PaymentProvider extends Context.Tag('PaymentProvider')<
  PaymentProvider,
  IPaymentProvider
>() {}
