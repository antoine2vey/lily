import {
  PaymentProviderError,
  type RevenueCatSubscriberInfo,
  type RevenueCatWebhookEvent,
} from '@lily/shared'
import { Config, Context, Effect, Layer, Option, pipe, Schema } from 'effect'

// RevenueCat provider interface (different from generic payment provider)
export interface IRevenueCatProvider {
  // Validate webhook authorization and parse event
  readonly constructWebhookEvent: (
    payload: string,
    authorization: string | undefined
  ) => Effect.Effect<RevenueCatWebhookEvent, PaymentProviderError>

  // Fetch subscriber info from RevenueCat API
  readonly getSubscriberInfo: (
    appUserId: string
  ) => Effect.Effect<RevenueCatSubscriberInfo, PaymentProviderError>
}

export class RevenueCatProvider extends Context.Tag('RevenueCatProvider')<
  RevenueCatProvider,
  IRevenueCatProvider
>() {}

// RevenueCat webhook event inner schema - only the fields we need
const RevenueCatEventDataSchema = Schema.Struct({
  type: Schema.String,
  id: Schema.String,
  app_user_id: Schema.String,
  original_app_user_id: Schema.String,
  aliases: Schema.optional(Schema.NullOr(Schema.Array(Schema.String))),
  product_id: Schema.String,
  entitlement_ids: Schema.optional(Schema.NullOr(Schema.Array(Schema.String))),
  store: Schema.String,
  environment: Schema.String,
  purchased_at_ms: Schema.Number,
  expiration_at_ms: Schema.NullOr(Schema.Number),
  is_trial_period: Schema.optional(Schema.NullOr(Schema.Boolean)),
  period_type: Schema.optional(Schema.NullOr(Schema.String)),
  price: Schema.optional(Schema.NullOr(Schema.Number)),
  price_in_purchased_currency: Schema.optional(Schema.NullOr(Schema.Number)),
  currency: Schema.optional(Schema.NullOr(Schema.String)),
  cancel_reason: Schema.optional(Schema.NullOr(Schema.String)),
  subscriber_attributes: Schema.optional(
    Schema.NullOr(Schema.Record({ key: Schema.String, value: Schema.Unknown }))
  ),
  transaction_id: Schema.optional(Schema.NullOr(Schema.String)),
  original_transaction_id: Schema.optional(Schema.NullOr(Schema.String)),
})

// Use a lenient struct that allows extra properties via Record
const RevenueCatWebhookEventSchema = Schema.Struct({
  api_version: Schema.String,
  event: Schema.extend(
    RevenueCatEventDataSchema,
    Schema.Record({ key: Schema.String, value: Schema.Unknown })
  ),
})

export const RevenueCatProviderLive = Layer.effect(
  RevenueCatProvider,
  Effect.gen(function* () {
    const webhookAuthKey = yield* pipe(
      Config.string('REVENUECAT_WEBHOOK_AUTH_KEY'),
      Config.withDefault('')
    )
    const apiKey = yield* pipe(
      Config.string('REVENUECAT_API_KEY'),
      Config.withDefault('')
    )

    const provider: IRevenueCatProvider = {
      constructWebhookEvent: (payload, authorization) =>
        Effect.gen(function* () {
          // Validate authorization header if configured
          if (webhookAuthKey.length > 0) {
            const expectedAuth = `Bearer ${webhookAuthKey}`
            if (authorization !== expectedAuth) {
              return yield* Effect.fail(
                new PaymentProviderError({
                  message: 'Invalid webhook authorization',
                  code: 'webhook_auth_invalid',
                })
              )
            }
          }

          // Parse the webhook payload
          const parsed = yield* Effect.try({
            try: () => JSON.parse(payload),
            catch: () =>
              new PaymentProviderError({
                message: 'Invalid webhook payload JSON',
                code: 'webhook_payload_invalid',
              }),
          })

          // Validate against schema
          const validated = yield* pipe(
            Schema.decodeUnknown(RevenueCatWebhookEventSchema)(parsed),
            Effect.mapError(
              () =>
                new PaymentProviderError({
                  message: 'Invalid webhook event structure',
                  code: 'webhook_schema_invalid',
                })
            )
          )

          // Cast to full type (the schema validates structure, type guards the rest)
          return validated as unknown as RevenueCatWebhookEvent
        }),

      getSubscriberInfo: (appUserId) =>
        Effect.gen(function* () {
          if (apiKey.length === 0) {
            return yield* Effect.fail(
              new PaymentProviderError({
                message: 'RevenueCat API key not configured',
                code: 'revenuecat_not_configured',
              })
            )
          }

          return yield* Effect.tryPromise({
            try: async () => {
              const response = await fetch(
                `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`,
                {
                  method: 'GET',
                  headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                  },
                }
              )

              if (!response.ok) {
                const errorText = await response.text()
                throw new Error(
                  `RevenueCat API error: ${response.status} - ${errorText}`
                )
              }

              const data = await response.json()
              return data as RevenueCatSubscriberInfo
            },
            catch: (error) =>
              new PaymentProviderError({
                message:
                  error instanceof Error
                    ? error.message
                    : 'Failed to fetch subscriber info',
                code: 'revenuecat_api_error',
              }),
          })
        }),
    }

    return provider
  })
)
