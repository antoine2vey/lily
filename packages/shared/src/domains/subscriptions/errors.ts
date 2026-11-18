import { Schema } from 'effect'

export class LimitExceededError extends Schema.TaggedError<
  LimitExceededError,
  { readonly brand: unique symbol }
>()(
  'LimitExceededError',
  {
    feature: Schema.String,
    limit: Schema.Finite,
    current: Schema.Finite,
    message: Schema.String,
  },
  { httpApiStatus: 403 }
) {}

export class PaymentProviderError extends Schema.TaggedError<
  PaymentProviderError,
  { readonly brand: unique symbol }
>()(
  'PaymentProviderError',
  {
    message: Schema.String,
    code: Schema.optional(Schema.String),
  },
  { httpApiStatus: 502 }
) {}

export class SubscriptionNotFoundError extends Schema.TaggedError<
  SubscriptionNotFoundError,
  { readonly brand: unique symbol }
>()(
  'SubscriptionNotFoundError',
  {
    userId: Schema.String,
  },
  { httpApiStatus: 404 }
) {}

export class InvalidSubscriptionStatusError extends Schema.TaggedError<
  InvalidSubscriptionStatusError,
  { readonly brand: unique symbol }
>()(
  'InvalidSubscriptionStatusError',
  {
    currentStatus: Schema.String,
    requiredStatus: Schema.String,
  },
  { httpApiStatus: 400 }
) {}
