import { timingSafeEqual as cryptoTimingSafeEqual } from 'node:crypto'
import { ServiceAuthentication } from '@lily/api/services/internal/middleware'
import { UnauthorizedError } from '@lily/shared'
import { Config, Effect, Layer, Redacted } from 'effect'

/**
 * Live implementation of ServiceAuthentication middleware.
 *
 * Reads `SERVICE_TOKEN_SECRET` from env at construction time.
 * On each request, compares the `X-Service-Secret` header value
 * (provided via HttpApiSecurity.apiKey) against the stored secret
 * using timing-safe comparison.
 */
export const ServiceAuthenticationLive = Layer.unwrapEffect(
  Effect.gen(function* () {
    const secret = yield* Config.redacted('SERVICE_TOKEN_SECRET')
    const secretValue = Redacted.value(secret)

    return Layer.succeed(
      ServiceAuthentication,
      ServiceAuthentication.of({
        apiKey: (redactedKey) =>
          Effect.gen(function* () {
            const key = Redacted.value(redactedKey)
            if (
              key.length !== secretValue.length ||
              !timingSafeEqual(key, secretValue)
            ) {
              return yield* new UnauthorizedError({
                message: 'Invalid service secret',
              })
            }
            return { verified: true as const }
          }),
      })
    )
  })
)

/**
 * Timing-safe string comparison using Node's native implementation.
 * Handles length mismatch without leaking length information via timing.
 */
const timingSafeEqual = (a: string, b: string): boolean => {
  const encoder = new TextEncoder()
  const bufA = encoder.encode(a)
  const bufB = encoder.encode(b)
  if (bufA.byteLength !== bufB.byteLength) return false
  return cryptoTimingSafeEqual(bufA, bufB)
}
