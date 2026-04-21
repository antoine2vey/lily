import {
  Cause,
  Clock,
  Config,
  Context,
  Duration,
  Effect,
  HashMap,
  Match,
  Option,
  Ref,
  String as Str,
} from 'effect'

export type AlertProvider =
  | 'openai'
  | 'openai-embedding'
  | 'resend'
  | 'expo-push'
  | 'revenuecat'

export type AlertSource =
  | 'auth'
  | 'weather-cache'
  | 'usage-tracker'
  | 'notification-worker'

export type AlertEvent =
  | {
      readonly _tag: 'HttpError5xx'
      readonly method: string
      readonly url: string
      readonly status: number
      readonly durationMs?: number
    }
  | {
      readonly _tag: 'ProviderError'
      readonly provider: AlertProvider
      readonly errorTag: string
      readonly message: string
      readonly userId?: string
    }
  | {
      readonly _tag: 'UnhandledDefect'
      readonly source: string
      readonly message: string
      readonly stack?: string
    }
  | {
      readonly _tag: 'OperationalWarning'
      readonly source: AlertSource
      readonly summary: string
      readonly context: Readonly<Record<string, unknown>>
    }

export interface IAlerter {
  readonly alert: (event: AlertEvent) => Effect.Effect<void>
  readonly alertWarning: (
    source: AlertSource,
    summary: string,
    context?: Readonly<Record<string, unknown>>
  ) => Effect.Effect<void>
}

export class Alerter extends Context.Tag('Alerter')<Alerter, IAlerter>() {}

export type AlerterSettings = {
  readonly environment: string
  readonly dedupeWindow: Duration.Duration
  readonly warningDedupeWindow: Duration.Duration
}

export const AlerterConfig = Config.all({
  environment: Config.string('ALERT_ENVIRONMENT_NAME').pipe(
    Config.withDefault('development')
  ),
  dedupeWindow: Config.duration('ALERT_DEDUPE_WINDOW').pipe(
    Config.withDefault(Duration.minutes(5))
  ),
  warningDedupeWindow: Config.duration('ALERT_WARNING_DEDUPE_WINDOW').pipe(
    Config.withDefault(Duration.minutes(15))
  ),
})

export type AlertMeta = {
  readonly environment: string
  readonly duplicateCount: number
}

export type AlertTransport = (
  event: AlertEvent,
  meta: AlertMeta
) => Effect.Effect<void, unknown>

type DedupEntry = {
  readonly firstSeenAt: number
  readonly lastSentAt: number
  readonly suppressedCount: number
}

type SendDecision =
  | { readonly _tag: 'Send'; readonly duplicateCount: number }
  | { readonly _tag: 'Skip' }

const FP_MAX = 80

// Matches RFC-4122 UUIDs appearing as path segments — replaced with `:id` so
// /api/plants/{uuid-1} and /api/plants/{uuid-2} share one fingerprint rather
// than polluting the dedup map with one entry per resource.
const UUID_PATH_RE =
  /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

export const normalizePath = (url: string): string => {
  const queryIdx = url.indexOf('?')
  const path = queryIdx === -1 ? url : Str.slice(0, queryIdx)(url)
  return path.replace(UUID_PATH_RE, '/:id')
}

const truncate = (s: string, n: number): string =>
  s.length > n ? Str.slice(0, n)(s) : s

export const fingerprintEvent = (event: AlertEvent): string =>
  Match.value(event).pipe(
    Match.tag(
      'HttpError5xx',
      (e) => `http:${e.status}:${e.method}:${normalizePath(e.url)}`
    ),
    Match.tag('ProviderError', (e) => `provider:${e.provider}:${e.errorTag}`),
    Match.tag(
      'UnhandledDefect',
      (e) => `defect:${e.source}:${truncate(e.message, FP_MAX)}`
    ),
    Match.tag(
      'OperationalWarning',
      (e) => `warn:${e.source}:${truncate(e.summary, FP_MAX)}`
    ),
    Match.exhaustive
  )

const windowFor = (
  event: AlertEvent,
  settings: AlerterSettings
): Duration.Duration =>
  event._tag === 'OperationalWarning'
    ? settings.warningDedupeWindow
    : settings.dedupeWindow

const decide = (
  existing: Option.Option<DedupEntry>,
  now: number,
  windowMs: number
): readonly [SendDecision, DedupEntry] =>
  Option.match(existing, {
    onNone: () => [
      { _tag: 'Send', duplicateCount: 0 },
      { firstSeenAt: now, lastSentAt: now, suppressedCount: 0 },
    ],
    onSome: (entry) =>
      now - entry.lastSentAt >= windowMs
        ? [
            { _tag: 'Send', duplicateCount: entry.suppressedCount },
            {
              firstSeenAt: entry.firstSeenAt,
              lastSentAt: now,
              suppressedCount: 0,
            },
          ]
        : [
            { _tag: 'Skip' },
            {
              firstSeenAt: entry.firstSeenAt,
              lastSentAt: entry.lastSentAt,
              suppressedCount: entry.suppressedCount + 1,
            },
          ],
  })

// Drop entries whose last activity is older than 2× the longest window — after
// that span, any recurrence would send a fresh alert anyway, so the state is
// noise. Bounds memory without changing observable behaviour.
const evictStale = (
  map: HashMap.HashMap<string, DedupEntry>,
  now: number,
  maxWindowMs: number
): HashMap.HashMap<string, DedupEntry> =>
  HashMap.filter(map, (entry) => now - entry.lastSentAt < maxWindowMs * 2)

export const makeAlerter = (
  transport: AlertTransport,
  settings: AlerterSettings
): Effect.Effect<IAlerter> =>
  Effect.gen(function* () {
    const state = yield* Ref.make(HashMap.empty<string, DedupEntry>())
    const maxWindowMs = Duration.toMillis(
      Duration.greaterThan(settings.dedupeWindow, settings.warningDedupeWindow)
        ? settings.dedupeWindow
        : settings.warningDedupeWindow
    )

    const alert = (event: AlertEvent): Effect.Effect<void> =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis
        const fp = fingerprintEvent(event)
        const windowMs = Duration.toMillis(windowFor(event, settings))
        const decision = yield* Ref.modify(state, (map) => {
          const pruned = evictStale(map, now, maxWindowMs)
          const [dec, entry] = decide(HashMap.get(pruned, fp), now, windowMs)
          return [dec, HashMap.set(pruned, fp, entry)] as const
        })
        if (decision._tag === 'Send') {
          yield* Effect.forkDaemon(
            transport(event, {
              environment: settings.environment,
              duplicateCount: decision.duplicateCount,
            }).pipe(
              Effect.catchAllCause((cause) =>
                Effect.logError('[alerter] transport failed', {
                  fingerprint: fp,
                  cause: Cause.pretty(cause),
                })
              )
            )
          )
        }
      })

    const alertWarning: IAlerter['alertWarning'] = (source, summary, context) =>
      alert({
        _tag: 'OperationalWarning',
        source,
        summary,
        context: context ?? {},
      })

    return { alert, alertWarning }
  })

/**
 * Log a warning to Railway (visible in logs) AND fire a deduplicated Discord
 * alert. Use at high-signal sites where both the local log breadcrumb and the
 * remote alert are wanted.
 */
export const logAndAlertWarning = (
  alerter: IAlerter,
  source: AlertSource,
  summary: string,
  context: Readonly<Record<string, unknown>> = {}
): Effect.Effect<void> =>
  Effect.gen(function* () {
    yield* Effect.logWarning(`[${source}] ${summary}`, context)
    yield* alerter.alertWarning(source, summary, context)
  })
