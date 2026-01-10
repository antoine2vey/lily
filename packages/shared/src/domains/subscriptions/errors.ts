import { Schema } from 'effect'

export class LimitExceededError extends Schema.TaggedError<LimitExceededError>()(
  'LimitExceededError',
  {
    feature: Schema.String,
    limit: Schema.Number,
    current: Schema.Number,
    message: Schema.String,
  }
) {}

export class PaymentProviderError extends Schema.TaggedError<PaymentProviderError>()(
  'PaymentProviderError',
  {
    message: Schema.String,
    code: Schema.optional(Schema.String),
  }
) {}

export class SubscriptionNotFoundError extends Schema.TaggedError<SubscriptionNotFoundError>()(
  'SubscriptionNotFoundError',
  {
    userId: Schema.String,
  }
) {}

export class InvalidSubscriptionStatusError extends Schema.TaggedError<InvalidSubscriptionStatusError>()(
  'InvalidSubscriptionStatusError',
  {
    currentStatus: Schema.String,
    requiredStatus: Schema.String,
  }
) {}
