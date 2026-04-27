import http2 from 'node:http2'
import {
  Array,
  Config,
  Data,
  Effect,
  Match,
  Option,
  pipe,
  Redacted,
} from 'effect'
import { importPKCS8, SignJWT } from 'jose'

// Direct APNs HTTP/2 client for Live Activities. Expo Push doesn't accept raw
// APNs push-to-start tokens, so LA events bypass it and talk to Apple directly.
// Auth is JWT (ES256) signed with a team's .p8 key.

const SANDBOX = 'https://api.sandbox.push.apple.com'
const PRODUCTION = 'https://api.push.apple.com'

// Apple rejects JWTs older than 60 min. 50 min leaves headroom for clock skew.
const JWT_TTL_SECONDS = 50 * 60

export interface ApnsConfig {
  readonly teamId: string
  readonly keyId: string
  readonly privateKeyPem: string // PKCS8 PEM content of .p8
  readonly bundleId: string
  readonly environment: 'sandbox' | 'production'
}

export class ApnsSendError extends Data.TaggedError('ApnsSendError')<{
  message: string
  status?: number
  reason?: string
  cause?: unknown
}> {}

interface JwtCache {
  token: string
  expiresAt: number // epoch seconds
}

interface JwtState {
  getToken: () => Promise<string>
}

const makeJwtState = (cfg: ApnsConfig): JwtState => {
  let keyPromise: Promise<CryptoKey> | null = null
  let cached: JwtCache | null = null
  let inflight: Promise<JwtCache> | null = null

  const getKey = () => {
    if (!keyPromise) keyPromise = importPKCS8(cfg.privateKeyPem, 'ES256')
    return keyPromise
  }

  const mint = async (): Promise<JwtCache> => {
    const key = await getKey()
    const iat = Math.floor(Date.now() / 1000)
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: cfg.keyId })
      .setIssuer(cfg.teamId)
      .setIssuedAt(iat)
      .sign(key)
    return { token, expiresAt: iat + JWT_TTL_SECONDS }
  }

  return {
    getToken: async () => {
      const now = Math.floor(Date.now() / 1000)
      if (cached && cached.expiresAt > now + 30) return cached.token
      if (!inflight) {
        const p = mint()
        // Clear on rejection so the next caller retries instead of inheriting
        // the poisoned promise forever.
        p.catch(() => {
          if (inflight === p) inflight = null
        })
        inflight = p
      }
      const fresh = await inflight
      cached = fresh
      inflight = null
      return fresh.token
    },
  }
}

// Config bindings — present only when APNs is fully configured.
const ApnsTeamIdConfig = Config.option(Config.string('APNS_TEAM_ID'))
const ApnsKeyIdConfig = Config.option(Config.string('APNS_KEY_ID'))
const ApnsPrivateKeyConfig = Config.option(Config.redacted('APNS_PRIVATE_KEY'))
const ApnsBundleIdConfig = Config.option(Config.string('APNS_BUNDLE_ID'))
const ApnsEnvironmentConfig = Config.string('APNS_ENVIRONMENT').pipe(
  Config.withDefault('sandbox')
)

export const loadApnsConfig: Effect.Effect<
  Option.Option<ApnsConfig>,
  never
> = Effect.gen(function* () {
  const teamId = yield* ApnsTeamIdConfig
  const keyId = yield* ApnsKeyIdConfig
  const key = yield* ApnsPrivateKeyConfig
  const bundleId = yield* ApnsBundleIdConfig
  const env = yield* ApnsEnvironmentConfig

  if (
    Option.isNone(teamId) ||
    Option.isNone(keyId) ||
    Option.isNone(key) ||
    Option.isNone(bundleId)
  ) {
    return Option.none<ApnsConfig>()
  }

  // Env vars carrying a .p8 body have `\n` escapes that must be unescaped
  // before `importPKCS8` can parse the PEM.
  const pem = Redacted.value(key.value).replaceAll('\\n', '\n')

  return Option.some<ApnsConfig>({
    teamId: teamId.value,
    keyId: keyId.value,
    privateKeyPem: pem,
    bundleId: bundleId.value,
    environment: Match.value(env).pipe(
      Match.when('production', () => 'production' as const),
      Match.orElse(() => 'sandbox' as const)
    ),
  })
}).pipe(
  // Malformed config → disable the client rather than crash on startup.
  Effect.catchTag('ConfigError', () =>
    Effect.succeed(Option.none<ApnsConfig>())
  )
)

export interface ApnsClient {
  readonly send: (args: {
    deviceToken: string // raw hex APNs token
    event: 'start' | 'update' | 'end'
    contentState?: Record<string, unknown>
    attributes?: Record<string, unknown>
    attributesType?: string
    alert?: { title: string; body: string; sound?: 'default' }
    dismissalDate?: number
  }) => Effect.Effect<{ apnsId: string }, ApnsSendError>
}

// Apple recommends reusing a single HTTP/2 session. We reconnect on Apple's
// ~1h idle timeout or any transport error; the next send reopens.
const getOrCreateSession = (
  state: { current: http2.ClientHttp2Session | null },
  baseUrl: string
): http2.ClientHttp2Session => {
  if (state.current && !state.current.closed && !state.current.destroyed) {
    return state.current
  }
  const session = http2.connect(baseUrl)
  session.on('error', () => session.destroy())
  session.on('goaway', () => session.destroy())
  state.current = session
  return session
}

const sendRequest = (
  session: http2.ClientHttp2Session,
  path: string,
  headers: Record<string, string>,
  body: string
): Promise<{ status: number; apnsId: string; body: string }> =>
  new Promise((resolve, reject) => {
    const req = session.request({
      ':method': 'POST',
      ':path': path,
      ...headers,
    })

    let status = 0
    let apnsId = ''
    const chunks: Buffer[] = []

    req.on('response', (responseHeaders) => {
      status = Number(responseHeaders[':status']) || 0
      const id = responseHeaders['apns-id']
      apnsId = Match.value(id).pipe(
        Match.when(Match.undefined, () => ''),
        Match.when(Match.string, (s) => s),
        Match.orElse((arr) =>
          pipe(
            Array.head(arr),
            Option.getOrElse(() => '')
          )
        )
      )
    })
    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
    })
    req.on('end', () => {
      resolve({
        status,
        apnsId,
        body: Buffer.concat(chunks as unknown as Uint8Array[]).toString('utf8'),
      })
    })
    req.on('error', reject)

    req.write(body)
    req.end()
  })

export const makeApnsClient = (cfg: ApnsConfig): ApnsClient => {
  const jwtState = makeJwtState(cfg)
  const baseUrl = Match.value(cfg.environment).pipe(
    Match.when('production', () => PRODUCTION),
    Match.when('sandbox', () => SANDBOX),
    Match.exhaustive
  )
  const topic = `${cfg.bundleId}.push-type.liveactivity`
  const sessionState: { current: http2.ClientHttp2Session | null } = {
    current: null,
  }

  return {
    send: (args) =>
      Effect.tryPromise({
        try: async () => {
          const jwt = await jwtState.getToken()

          const aps: Record<string, unknown> = {
            timestamp: Math.floor(Date.now() / 1000),
            event: args.event,
          }
          if (args.contentState) aps['content-state'] = args.contentState
          if (args.attributes) aps.attributes = args.attributes
          if (args.attributesType) aps['attributes-type'] = args.attributesType
          if (args.dismissalDate) aps['dismissal-date'] = args.dismissalDate
          if (args.alert) {
            aps.alert = {
              title: args.alert.title,
              body: args.alert.body,
              ...(args.alert.sound ? { sound: args.alert.sound } : {}),
            }
          }

          const body = JSON.stringify({ aps })
          const session = getOrCreateSession(sessionState, baseUrl)
          const {
            status,
            apnsId,
            body: respBody,
          } = await sendRequest(
            session,
            `/3/device/${args.deviceToken}`,
            {
              authorization: `bearer ${jwt}`,
              'apns-topic': topic,
              'apns-push-type': 'liveactivity',
              'apns-priority': '10',
              'content-type': 'application/json',
            },
            body
          )

          if (status >= 200 && status < 300) {
            return { apnsId }
          }

          // APNs returns JSON on errors: { reason: "BadDeviceToken", ... }
          let reason = respBody
          try {
            const parsed = JSON.parse(respBody) as { reason?: unknown }
            reason = pipe(
              Option.fromNullable(parsed.reason),
              Option.filter((r): r is string => typeof r === 'string'),
              Option.getOrElse(() => respBody)
            )
          } catch {
            // non-JSON body, keep as-is
          }
          throw { status, reason }
        },
        catch: (err) => {
          const maybe = err as {
            status?: number
            reason?: string
            message?: string
          }
          const detail = pipe(
            Option.fromNullable(maybe.reason),
            Option.orElse(() => Option.fromNullable(maybe.message)),
            Option.getOrElse(() => String(err))
          )
          return new ApnsSendError({
            message: `APNs LA send failed: ${detail}`,
            ...(maybe.status !== undefined ? { status: maybe.status } : {}),
            ...(maybe.reason !== undefined ? { reason: maybe.reason } : {}),
            cause: err,
          })
        },
      }),
  }
}
