import { DeviceTokenRepository } from '@lily/api/repositories/device-token.repository'
import { Alerter, withProviderAlert } from '@lily/api/services/alerting'
import {
  type ApnsClient,
  type ApnsConfig,
  loadApnsConfig,
  makeApnsClient,
} from '@lily/api/services/push/apns-live-activity'
import {
  ExpoPushClient,
  isDeviceNotRegistered,
} from '@lily/api/services/push/expo-push-client'
import { PendingPushReceipts } from '@lily/api/services/push/pending-push-receipts'
import {
  type DeadToken,
  type RetireReason,
  retireExpoTokens,
} from '@lily/api/services/push/retire-expo-tokens'
import {
  CARE_TASKS_ATTRIBUTES_TYPE,
  type IPushService,
  type LiveActivityPushMessage,
  PushConfigError,
  type PushMessage,
  PushSendError,
  PushService,
  type PushTicket,
  PushTokenInvalidatedError,
} from '@lily/shared/server'
import {
  Array,
  DateTime,
  Effect,
  HashSet,
  Layer,
  Match,
  Option,
  pipe,
  Result,
} from 'effect'
import Expo, {
  type ExpoPushMessage,
  type ExpoPushTicket,
} from 'expo-server-sdk'

// Combines Expo (regular pushes) and direct APNs (Live Activities). Expo
// Push v4 rejects raw APNs push-to-start tokens, so LA events split off.

// 1h delivery window for LA starts. Default APNs expiration of 0 means
// "deliver now or drop" — lethal if the device is briefly offline.
const LA_START_EXPIRATION_SECONDS = 60 * 60

// APNs reasons meaning THIS DEVICE's token is unusable — retire it and let the
// device re-register. (`DeviceTokenNotForTopic` = the stored token isn't a
// valid push-to-start token for our Live Activity topic.)
const DEVICE_TERMINAL_REASONS = HashSet.make(
  'BadDeviceToken',
  'Unregistered',
  'DeviceTokenNotForTopic'
)

// APNs reasons that are OUR fault, not the device's: an expired provider JWT,
// or a topic our key isn't allowed to use. These must NEVER retire a user's
// token — doing so would mass-delete every device the moment the key expires.
// Surface them to the operator (the alert wrapper fires) and move on.
const PROVIDER_FAULT_REASONS = HashSet.make(
  'ExpiredProviderToken',
  'TopicDisallowed'
)

// Pure classifier: an APNs failure → the typed push error. Exported for unit
// tests. Device-terminal reasons retire the token; provider-fault reasons
// alert without retiring; everything else (network, 5xx, rate-limit) is a
// transient send error.
export const mapApnsReasonToPushError = (e: {
  message: string
  reason?: string
}): PushTokenInvalidatedError | PushConfigError | PushSendError => {
  const reason = pipe(
    Option.fromNullishOr(e.reason),
    Option.getOrElse(() => '')
  )
  return Match.value(reason).pipe(
    Match.when(
      (r) => HashSet.has(DEVICE_TERMINAL_REASONS, r),
      () =>
        new PushTokenInvalidatedError({
          message: `APNs token invalidated: ${reason}`,
          reason,
        })
    ),
    Match.when(
      (r) => HashSet.has(PROVIDER_FAULT_REASONS, r),
      () =>
        new PushConfigError({
          message: `APNs provider/auth fault (${reason}) — not retiring user token`,
        })
    ),
    Match.orElse(() => new PushSendError({ message: e.message, cause: e }))
  )
}

const buildAlertField = (
  alert:
    | Readonly<{ title: string; body: string; sound?: 'default' | undefined }>
    | undefined
): { alert?: { title: string; body: string; sound?: 'default' } } => {
  if (!alert) return {}
  return {
    alert: {
      title: alert.title,
      body: alert.body,
      ...pipe(
        Option.fromNullishOr(alert.sound),
        Option.match({
          onNone: () => ({}),
          onSome: (sound) => ({ sound }),
        })
      ),
    },
  }
}

const encodeContentState = (state: {
  readonly schemaVersion: number
  readonly totalPlants: number
  readonly groups: unknown
  readonly headline: string
  readonly subheadline?: string | undefined
  readonly title: string
  readonly completedToday: number
  readonly updatedAt: Date
}): Record<string, unknown> => ({
  schemaVersion: state.schemaVersion,
  totalPlants: state.totalPlants,
  groups: state.groups,
  headline: state.headline,
  subheadline: state.subheadline,
  title: state.title,
  completedToday: state.completedToday,
  // APS timestamps are epoch seconds. `| 0` truncates toward zero (same as
  // Math.floor for positive values) without allocating a DateTime wrapper.
  updatedAt: (state.updatedAt.getTime() / 1000) | 0,
})

export const buildExpoMessage = (message: PushMessage): ExpoPushMessage => {
  const out: ExpoPushMessage = {
    to: message.to,
    title: message.title,
    body: message.body,
  }
  if (message.data) out.data = message.data as Record<string, unknown>
  if (message.sound) out.sound = message.sound
  if (message.badge !== undefined) out.badge = message.badge
  if (message.interruptionLevel)
    out.interruptionLevel = message.interruptionLevel
  return out
}

const convertTicket = (ticket: ExpoPushTicket): PushTicket =>
  pipe(
    Match.value(ticket),
    Match.when({ status: 'error' }, (t) => ({
      id: crypto.randomUUID(),
      status: 'error' as const,
      message: t.message,
    })),
    Match.when({ status: 'ok' }, (t) => ({
      id: t.id,
      status: 'ok' as const,
    })),
    Match.exhaustive
  )

export const ExpoPlusApnsPushServiceLive = Layer.effect(
  PushService,
  Effect.gen(function* () {
    const expoClient = yield* ExpoPushClient
    const pendingReceipts = yield* PendingPushReceipts
    const deviceTokens = yield* DeviceTokenRepository
    const alerter = yield* Alerter
    const alert = withProviderAlert(alerter, { provider: 'expo-push' })

    // Retiring is bookkeeping: a DB hiccup must not fail the batch, which the
    // worker would then retry and re-send to the healthy devices.
    const retire = (dead: ReadonlyArray<DeadToken>, reason: RetireReason) =>
      retireExpoTokens(dead, reason).pipe(
        Effect.provideService(DeviceTokenRepository, deviceTokens),
        Effect.catchTag('SqlError', (error) =>
          Effect.logWarning('[push] Could not retire dead Expo tokens', {
            reason,
            error: error.message,
          })
        )
      )

    const apnsOpt: Option.Option<ApnsConfig> = yield* loadApnsConfig
    const apnsClient: ApnsClient | null = Option.match(apnsOpt, {
      onNone: () => null,
      onSome: (cfg) => makeApnsClient(cfg),
    })

    if (!apnsClient) {
      yield* Effect.logWarning(
        '[push] APNs creds not fully set (APNS_TEAM_ID / APNS_KEY_ID / APNS_PRIVATE_KEY / APNS_BUNDLE_ID) — Live Activity sends will error out'
      )
    } else {
      yield* Effect.log('[push] Expo + direct-APNs provider initialized')
    }

    const service: IPushService = {
      send: Effect.fn('ExpoPlusApns.send')(function* (message: PushMessage) {
        yield* Effect.annotateCurrentSpan('push.token', message.to)
        if (!Expo.isExpoPushToken(message.to)) {
          return yield* new PushConfigError({
            message: `Invalid Expo push token: ${message.to}`,
          })
        }
        const result = yield* expoClient.send([buildExpoMessage(message)])
        const ticket = yield* pipe(
          Array.head(result),
          Option.match({
            onNone: () =>
              Effect.fail(
                new PushSendError({ message: 'No ticket received from Expo' })
              ),
            onSome: Effect.succeed,
          })
        )
        if (ticket.status === 'error') {
          return yield* new PushSendError({
            message: pipe(
              Option.fromNullishOr(ticket.message),
              Option.getOrElse(() => 'Unknown push error')
            ),
            cause: ticket.details,
          })
        }
        return { id: ticket.id, status: 'ok' as const } satisfies PushTicket
      }, alert),

      // A bad token costs only its own message: malformed tokens and tokens
      // Expo reports as unregistered are retired, the rest still go out.
      sendBatch: Effect.fn('ExpoPlusApns.sendBatch')(function* (
        messages: readonly PushMessage[]
      ) {
        yield* Effect.annotateCurrentSpan('push.count', Array.length(messages))
        const sentAt = yield* DateTime.now
        const [deliverable, malformed] = Array.partition(messages, (m) =>
          Expo.isExpoPushToken(m.to) ? Result.succeed(m) : Result.fail(m)
        )
        yield* retire(
          Array.map(malformed, (m) => ({ token: m.to, sentAt })),
          'malformed'
        )

        const tickets = yield* expoClient.send(
          Array.map(deliverable, buildExpoMessage)
        )
        const sent = Array.zip(deliverable, tickets)

        yield* retire(
          Array.filterMap(sent, ([m, ticket]) =>
            isDeviceNotRegistered(ticket)
              ? Result.succeed({ token: m.to, sentAt })
              : Result.failVoid
          ),
          'DeviceNotRegistered'
        )
        yield* pendingReceipts
          .add(
            Array.filterMap(sent, ([m, ticket]) =>
              ticket.status === 'ok'
                ? Result.succeed({ ticketId: ticket.id, token: m.to, sentAt })
                : Result.failVoid
            )
          )
          .pipe(
            Effect.catchTag('PendingPushReceiptsError', (error) =>
              Effect.logWarning(
                '[push] Could not record tickets for receipts',
                {
                  error: error.message,
                }
              )
            )
          )

        return Array.appendAll(
          Array.map(tickets, convertTicket),
          Array.map(
            malformed,
            (m): PushTicket => ({
              id: crypto.randomUUID(),
              status: 'error',
              message: `Invalid Expo push token: ${m.to}`,
            })
          )
        )
      }, alert),

      sendLiveActivity: Effect.fn('ExpoPlusApns.sendLiveActivity')(function* (
        message: LiveActivityPushMessage
      ) {
        yield* Effect.annotateCurrentSpan('push.token', message.to)
        yield* Effect.annotateCurrentSpan('liveActivity.event', message._tag)

        if (!apnsClient) {
          return yield* new PushConfigError({
            message: 'APNs client not configured — set APNS_* env vars',
          })
        }

        const result = yield* pipe(
          Match.value(message),
          Match.tag('LiveActivityStart', (m) =>
            apnsClient.send({
              deviceToken: m.to,
              event: 'start',
              contentState: encodeContentState(m.contentState),
              attributes: { ...m.attributes },
              attributesType: CARE_TASKS_ATTRIBUTES_TYPE,
              ...buildAlertField(m.alert),
              expiration:
                Math.floor(Date.now() / 1000) + LA_START_EXPIRATION_SECONDS,
            })
          ),
          Match.tag('LiveActivityUpdate', (m) =>
            apnsClient.send({
              deviceToken: m.to,
              event: 'update',
              contentState: encodeContentState(m.contentState),
              ...buildAlertField(m.alert),
            })
          ),
          Match.tag('LiveActivityEnd', (m) =>
            apnsClient.send({
              deviceToken: m.to,
              event: 'end',
              ...pipe(
                Option.fromNullishOr(m.contentState),
                Option.match({
                  onNone: () => ({}),
                  onSome: (cs) => ({ contentState: encodeContentState(cs) }),
                })
              ),
              dismissalDate: Math.floor(Date.now() / 1000),
            })
          ),
          Match.exhaustive,
          Effect.mapError(mapApnsReasonToPushError)
        )

        return {
          id: result.apnsId || crypto.randomUUID(),
          status: 'ok' as const,
        } satisfies PushTicket
      }, alert),
    }

    return service
  })
)
