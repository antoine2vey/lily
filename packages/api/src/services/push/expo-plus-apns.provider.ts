import { Alerter, withProviderAlert } from '@lily/api/services/alerting'
import {
  type ApnsClient,
  type ApnsConfig,
  loadApnsConfig,
  makeApnsClient,
} from '@lily/api/services/push/apns-live-activity'
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
import { Array, Effect, HashSet, Layer, Match, Option, pipe } from 'effect'
import Expo, {
  type ExpoPushMessage,
  type ExpoPushTicket,
} from 'expo-server-sdk'

// Combines Expo (regular pushes) and direct APNs (Live Activities). Expo
// Push v4 rejects raw APNs push-to-start tokens, so LA events split off.

// Terminal APNs reasons: token/activity is permanently unusable. Everything
// else (network, 5xx, rate-limit) is transient and retries as PushSendError.
const TERMINAL_APNS_REASONS = HashSet.make(
  'BadDeviceToken',
  'Unregistered',
  'DeviceTokenNotForTopic',
  'ExpiredProviderToken',
  'TopicDisallowed'
)

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
        Option.fromNullable(alert.sound),
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

const buildExpoMessage = (message: PushMessage): ExpoPushMessage => {
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
    const expo = new Expo()
    const alerter = yield* Alerter
    const alert = withProviderAlert(alerter, { provider: 'expo-push' })

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
        const result = yield* Effect.tryPromise({
          try: () =>
            expo.sendPushNotificationsAsync([buildExpoMessage(message)]),
          catch: (error) =>
            new PushSendError({
              message: 'Failed to send push notification',
              cause: error,
            }),
        })
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
              Option.fromNullable(ticket.message),
              Option.getOrElse(() => 'Unknown push error')
            ),
            cause: ticket.details,
          })
        }
        return { id: ticket.id, status: 'ok' as const } satisfies PushTicket
      }, alert),

      sendBatch: Effect.fn('ExpoPlusApns.sendBatch')(function* (
        messages: readonly PushMessage[]
      ) {
        yield* Effect.annotateCurrentSpan('push.count', Array.length(messages))
        const invalid = Array.filter(
          messages,
          (m) => !Expo.isExpoPushToken(m.to)
        )
        if (Array.isNonEmptyArray(invalid)) {
          return yield* new PushConfigError({
            message: `Invalid Expo push tokens: ${Array.join(
              Array.map(invalid, (t) => t.to),
              ', '
            )}`,
          })
        }
        const chunks = expo.chunkPushNotifications(
          Array.map(messages, buildExpoMessage)
        )
        const batches = yield* Effect.forEach(chunks, (chunk) =>
          Effect.map(
            Effect.tryPromise({
              try: () => expo.sendPushNotificationsAsync(chunk),
              catch: (error) =>
                new PushSendError({
                  message: 'Failed to send push notification batch',
                  cause: error,
                }),
            }),
            (result) => Array.map(result, convertTicket)
          )
        )
        return Array.flatten(batches)
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
                Option.fromNullable(m.contentState),
                Option.match({
                  onNone: () => ({}),
                  onSome: (cs) => ({ contentState: encodeContentState(cs) }),
                })
              ),
              dismissalDate: Math.floor(Date.now() / 1000),
            })
          ),
          Match.exhaustive,
          Effect.mapError((e) => {
            const reason = pipe(
              Option.fromNullable(e.reason),
              Option.getOrElse(() => '')
            )
            return Match.value(HashSet.has(TERMINAL_APNS_REASONS, reason)).pipe(
              Match.when(
                true,
                () =>
                  new PushTokenInvalidatedError({
                    message: `APNs token invalidated: ${reason}`,
                    reason,
                  })
              ),
              Match.when(
                false,
                () => new PushSendError({ message: e.message, cause: e })
              ),
              Match.exhaustive
            )
          })
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
