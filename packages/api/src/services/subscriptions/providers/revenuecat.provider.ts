import {
  PaymentProviderError,
  type RevenueCatSubscriberInfo,
  type RevenueCatWebhookEvent,
  RevenueCatWebhookEventData,
} from '@lily/shared'
import { Config, Context, Effect, Layer, pipe, Schema } from 'effect'

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

// Extend the shared schema with a lenient Record so unknown properties from
// RevenueCat don't cause decode failures. We also override `type` to
// Schema.String so that new/unknown event types are accepted at decode time
// (the downstream Match.orElse in helpers.ts handles them gracefully).
const LenientEventDataSchema = Schema.extend(
  Schema.Struct({ ...RevenueCatWebhookEventData.fields, type: Schema.String }),
  Schema.Record({ key: Schema.String, value: Schema.Unknown })
)

const RevenueCatWebhookEventSchema = Schema.Struct({
  api_version: Schema.String,
  event: LenientEventDataSchema,
})

export const RevenueCatProviderLive = Layer.effect(
  RevenueCatProvider,
  Effect.gen(function* () {
    const webhookAuthKey = yield* Config.string('REVENUECAT_WEBHOOK_AUTH_KEY')
    const apiKey = yield* pipe(
      Config.string('REVENUECAT_API_KEY'),
      Config.withDefault('')
    )

    const provider: IRevenueCatProvider = {
      constructWebhookEvent: (payload, authorization) =>
        Effect.gen(function* () {
          yield* Effect.annotateCurrentSpan('revenuecat.webhook', true)
          // Always validate authorization header
          const expectedAuth = `Bearer ${webhookAuthKey}`
          if (authorization !== expectedAuth) {
            return yield* Effect.fail(
              new PaymentProviderError({
                message: 'Invalid webhook authorization',
                code: 'webhook_auth_invalid',
              })
            )
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
        }).pipe(Effect.withSpan('RevenueCat.constructWebhook')),

      getSubscriberInfo: (appUserId) =>
        Effect.gen(function* () {
          yield* Effect.annotateCurrentSpan('revenuecat.appUserId', appUserId)
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
        }).pipe(Effect.withSpan('RevenueCat.getSubscriberInfo')),
    }

    return provider
  })
)
