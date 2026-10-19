import { timingSafeEqual } from 'node:crypto'
import { Alerter, withProviderAlert } from '@lily/api/services/alerting'
import {
  PaymentProviderError,
  type RevenueCatEnvironment,
  RevenueCatSubscriberInfo,
  type RevenueCatWebhookEvent,
  RevenueCatWebhookEventData,
} from '@lily/shared'
import { Config, Context, Effect, Layer, pipe, Schema } from 'effect'

// RevenueCat provider interface (different from generic payment provider)
export interface IRevenueCatProvider {
  // The only event environment this deployment applies. Events from the
  // other one are acknowledged and ignored.
  readonly environment: RevenueCatEnvironment

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

export class RevenueCatProvider extends Context.Service<
  RevenueCatProvider,
  IRevenueCatProvider
>()('RevenueCatProvider') {}

// Extend the shared schema with a lenient Record so unknown properties from
// RevenueCat don't cause decode failures. We also override `type` to
// Schema.String so that new/unknown event types are accepted at decode time:
// every type is handled the same way (fetch the subscriber, apply the state).
const LenientEventDataSchema = Schema.StructWithRest(
  Schema.Struct({ ...RevenueCatWebhookEventData.fields, type: Schema.String }),
  [Schema.Record(Schema.String, Schema.Unknown)]
)

const RevenueCatWebhookEventSchema = Schema.Struct({
  api_version: Schema.String,
  event: LenientEventDataSchema,
})

const NodeEnvConfig = Config.String('NODE_ENV').pipe(
  Config.withDefault('development')
)

const secretsMatch = (given: string, expected: string): boolean => {
  const encoder = new TextEncoder()
  const a = encoder.encode(given)
  const b = encoder.encode(expected)
  if (a.byteLength !== b.byteLength) return false
  return timingSafeEqual(a, b)
}

export const RevenueCatProviderLive = Layer.effect(
  RevenueCatProvider,
  Effect.gen(function* () {
    const webhookAuthKey = yield* Config.String('REVENUECAT_WEBHOOK_AUTH_KEY')
    const apiKey = yield* pipe(
      Config.String('REVENUECAT_API_KEY'),
      Config.withDefault('')
    )
    const nodeEnv = yield* NodeEnvConfig
    const environment: RevenueCatEnvironment =
      nodeEnv === 'production' ? 'PRODUCTION' : 'SANDBOX'

    const decodeWebhookPayload = Schema.decodeUnknownEffect(
      Schema.fromJsonString(Schema.Unknown).pipe(
        Schema.decodeTo(RevenueCatWebhookEventSchema)
      )
    )
    const decodeSubscriberInfo = Schema.decodeUnknownEffect(
      RevenueCatSubscriberInfo
    )

    const constructWebhookEvent = Effect.fn('RevenueCat.constructWebhook')(
      function* (payload: string, authorization: string | undefined) {
        yield* Effect.annotateCurrentSpan('revenuecat.webhook', true)
        const expectedAuth = `Bearer ${webhookAuthKey}`
        if (
          authorization === undefined ||
          !secretsMatch(authorization, expectedAuth)
        ) {
          return yield* new PaymentProviderError({
            message: 'Invalid webhook authorization',
            code: 'webhook_auth_invalid',
          })
        }

        const validated = yield* pipe(
          decodeWebhookPayload(payload),
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
      }
    )

    const alerter = yield* Alerter
    const alert = withProviderAlert(alerter, { provider: 'revenuecat' })

    const getSubscriberInfo = Effect.fn('RevenueCat.getSubscriberInfo')(
      function* (appUserId: string) {
        yield* Effect.annotateCurrentSpan('revenuecat.appUserId', appUserId)
        if (apiKey.length === 0) {
          return yield* new PaymentProviderError({
            message: 'RevenueCat API key not configured',
            code: 'revenuecat_not_configured',
          })
        }

        const body = yield* Effect.tryPromise({
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

            return (await response.json()) as unknown
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

        return yield* pipe(
          decodeSubscriberInfo(body),
          Effect.mapError(
            (error) =>
              new PaymentProviderError({
                message: `Unexpected RevenueCat subscriber response: ${error.message}`,
                code: 'revenuecat_schema_invalid',
              })
          )
        )
      },
      alert
    )

    return {
      environment,
      constructWebhookEvent,
      getSubscriberInfo,
    } satisfies IRevenueCatProvider
  })
)
