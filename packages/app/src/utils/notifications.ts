import type { LanguageCode } from '@lily/shared'
// Type-only import — erased at compile time, so no server code is bundled
import type { NotificationTopic } from '@lily/shared/server'
import {
  Array as Arr,
  Match,
  Option,
  pipe,
  Record as Rec,
  String as Str,
} from 'effect'
import * as Device from 'expo-device'
import * as Localization from 'expo-localization'
import * as Notifications from 'expo-notifications'
import type { Href, Router } from 'expo-router'
import { Platform } from 'react-native'
import {
  endActivity as endLocalActivity,
  isPushToStartSupported,
  listActiveActivities,
  requestPushToStartToken,
  subscribeToActivityTokens,
  subscribeToPushToStartTokenUpdates,
} from '../../modules/expo-live-activity-lily/src'
import { apiEffectRunner } from './client'

// Configure how notifications appear when app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

type NotificationPlatform = 'ios' | 'android' | 'web'

/**
 * Get the platform type for device token registration
 */
export function getPlatform(): NotificationPlatform {
  return pipe(
    Match.value(Platform.OS),
    Match.when('ios', () => 'ios' as const),
    Match.when('android', () => 'android' as const),
    Match.orElse(() => 'web' as const)
  )
}

/**
 * Request notification permissions and get the Expo push token
 * Returns null if not on a physical device or permissions are denied
 */
export async function getExpoPushToken(): Promise<string | null> {
  // Push notifications only work on physical devices
  if (!Device.isDevice) {
    console.log('Push notifications require a physical device')
    return null
  }

  // Request permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync()
  let finalStatus = existingStatus

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }

  if (finalStatus !== 'granted') {
    console.log('Push notification permission not granted')
    return null
  }

  try {
    const projectId = process.env.EXPO_PUBLIC_PROJECT_ID
    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : {}
    )
    return tokenData.data
  } catch (error) {
    console.error('Failed to get push token:', error)
    return null
  }
}

// ============================================================================
// Live Activity token registration helpers.
//
// Two kinds of tokens flow through here:
//   1. push-to-start token (device-level, one per device, iOS 17.2+): lets
//      the server REMOTELY start an activity. Read on boot + on OS-initiated
//      rotation.
//   2. per-activity update token (one per running activity): lets the server
//      update/end a specific running activity. Fires after the server sent
//      a start push.
// ============================================================================

const postStartToken = async (
  deviceTokenId: string,
  startToken: string
): Promise<void> => {
  try {
    await apiEffectRunner('activityPushTokens', 'registerStartToken', {
      payload: { startToken, deviceTokenId },
    })
  } catch (err) {
    console.warn('Failed to register LA push-to-start token', err)
  }
}

const postActivityToken = async (
  deviceTokenId: string,
  activityId: string,
  updateToken: string
): Promise<void> => {
  try {
    await apiEffectRunner('activityPushTokens', 'registerActivityToken', {
      payload: { activityId, updateToken, deviceTokenId },
    })
  } catch (err) {
    console.warn('Failed to register LA activity token', err)
  }
}

/**
 * Notify the server that an activity has ended (we called `endActivity()`
 * locally because there's nothing left to do). Idempotent — ok if the
 * server already has the row marked ended.
 */
const postActivityEnded = async (activityId: string): Promise<void> => {
  try {
    await apiEffectRunner('activityPushTokens', 'endActivity', {
      path: { activityId },
    })
  } catch (err) {
    // The DELETE might return 404 if the server already cleaned up — not
    // worth logging as a warning in that case.
    if (
      err &&
      typeof err === 'object' &&
      'status' in err &&
      err.status !== 404
    ) {
      console.warn('Failed to tell server activity ended', err)
    }
  }
}

/**
 * Reconcile Live Activity state with the backend on app foreground.
 *
 * Handles three cases by combining what iOS has on-device with what the
 * server thinks is due:
 *
 *   1. iOS has a running activity AND user has due care tasks → re-register
 *      the update token (server might have lost it via DB reset, or this
 *      is the cold-start path where the token never got posted yet).
 *
 *   2. iOS has a running activity BUT user has no due tasks → end the
 *      activity locally via ActivityKit (bypasses APNs dismissal budget,
 *      guaranteed to work). Tell the server to mark the row ended too.
 *
 *   3. iOS has no activity → nothing to do on the app side. The server's
 *      5-minute reconciliation sweep handles any stale active rows there.
 *
 * Safe to call repeatedly.
 */
export async function reconcileLiveActivityTokens(
  deviceTokenId: string
): Promise<void> {
  if (Platform.OS !== 'ios') return
  try {
    const active = await listActiveActivities()
    if (active.length === 0) return

    // Ask the server whether there are any care tasks that still need doing.
    // If zero, iOS's activity is stale and should be dismissed locally — the
    // server-side end push may have been silently dropped by APNs' dismissal
    // budget, so we can't rely on it.
    let hasRemainingTasks = true
    try {
      const tasks = await apiEffectRunner('careTasks', 'getCareTasks', {})
      hasRemainingTasks = tasks.overdue.length > 0 || tasks.today.length > 0
    } catch (err) {
      console.warn('Failed to fetch care tasks during reconcile', err)
      // Be conservative on fetch failure: assume there's work so we don't
      // accidentally dismiss a valid activity.
    }

    for (const a of active) {
      if (!hasRemainingTasks) {
        // End the activity on-device via ActivityKit. Bypasses APNs budget.
        await endLocalActivity(a.activityId)
        await postActivityEnded(a.activityId)
        continue
      }
      // Still work to do → make sure server has our current update token.
      if (a.pushToken) {
        void postActivityToken(deviceTokenId, a.activityId, a.pushToken)
      }
    }
  } catch (err) {
    console.warn('Failed to reconcile LA tokens', err)
  }
}

/**
 * Register iOS Live Activity tokens with the backend.
 *
 * Returns an unsubscribe function that cleans up both event listeners. Safe
 * to call on non-iOS — it no-ops via the module shim.
 */
export async function registerLiveActivityTokens(
  deviceTokenId: string
): Promise<() => void> {
  if (Platform.OS !== 'ios') return () => {}

  // Push-to-start lifetime hook: fetch any current token, then subscribe
  // to OS rotations. Both paths hit the same backend endpoint which upserts.
  if (isPushToStartSupported()) {
    try {
      const current = await requestPushToStartToken()
      if (current) void postStartToken(deviceTokenId, current)
    } catch (err) {
      // iOS may launch us in the background (push-to-start wake-up) while the
      // device is locked → the keychain is inaccessible and the native read
      // throws "user interaction not allowed". Expected; the rotation
      // subscription below re-fires once the device unlocks.
      console.warn('push-to-start token unavailable (device locked?)', err)
    }
  }

  const unsubStart = subscribeToPushToStartTokenUpdates((tok) => {
    void postStartToken(deviceTokenId, tok)
  })

  const unsubActivity = subscribeToActivityTokens(
    ({ activityId, pushToken }) => {
      if (pushToken) {
        void postActivityToken(deviceTokenId, activityId, pushToken)
      }
    }
  )

  // Cold-start recovery: iOS may have started a Live Activity via push
  // while the app was killed. By the time we reach here, the activity is
  // already on the lock screen and its pushTokenUpdates stream has already
  // fired its initial emission — which we missed.
  await reconcileLiveActivityTokens(deviceTokenId)

  return () => {
    unsubStart()
    unsubActivity()
  }
}

/**
 * Parse plantIds from the push data payload.
 * The worker sends them as a comma-separated string.
 */
const parsePlantIds = (raw: unknown): string[] => {
  if (typeof raw !== 'string' || raw === '') return []
  return pipe(Str.split(raw, ','), Arr.filter(Str.isNonEmpty))
}

/**
 * Route to a plant screen (single plant) or care tab (multiple/none).
 */
const plantRoute = (data: Record<string, unknown>): Href => {
  const plantIds = parsePlantIds(data.plantIds)
  return plantIds.length === 1
    ? (`/(app)/plant/${plantIds[0]}` as Href)
    : ('/(app)/(tabs)/care' as Href)
}

/**
 * Route to a plant screen (single plant) or plants tab (multiple/none).
 * For topics that are about plants but not about pending care tasks.
 */
const plantOrPlantsTabRoute = (data: Record<string, unknown>): Href => {
  const plantIds = parsePlantIds(data.plantIds)
  return plantIds.length === 1
    ? (`/(app)/plant/${plantIds[0]}` as Href)
    : ('/(app)/(tabs)/plants' as Href)
}

/**
 * Route to a delegation detail screen, or the delegations list as fallback.
 */
const delegationRoute = (data: Record<string, unknown>): Href => {
  const delegationId =
    typeof data.delegationId === 'string' ? data.delegationId : null
  return delegationId
    ? (`/(app)/delegation/${delegationId}` as Href)
    : ('/(app)/delegations' as Href)
}

type NotificationRouteResolver = (data: Record<string, unknown>) => Href | null

/**
 * Deep-link destination per notification topic. `satisfies Record<
 * NotificationTopic, ...>` makes this exhaustive at compile time — adding a
 * topic to NOTIFICATION_TOPICS in @lily/shared without mapping a route here
 * fails `bun run tsc` (same pattern as TOPIC_CATEGORY in shared).
 *
 * A resolver may still return null when the payload lacks the data needed
 * to navigate (e.g. new_follower without a senderId).
 */
const TOPIC_ROUTES = {
  // Care reminders — single plant → plant screen, multiple/none → care tab
  watering_reminder: plantRoute,
  fertilization_reminder: plantRoute,
  misting_reminder: plantRoute,
  repotting_reminder: plantRoute,
  overdue_reminder: plantRoute,
  photo_reminder: plantRoute,

  // Social — new follower → profile of the person who followed
  new_follower: (data) => {
    const senderId = typeof data.senderId === 'string' ? data.senderId : null
    return senderId ? (`/(app)/public-profile/${senderId}` as Href) : null
  },

  // Social — nudge → care tab
  nudge_to_water: () => '/(app)/(tabs)/care' as Href,

  // Delegation topics → delegation detail or list fallback
  delegation_request: delegationRoute,
  delegation_accepted: delegationRoute,
  delegation_rejected: delegationRoute,
  delegation_canceled: delegationRoute,
  delegation_activated: delegationRoute,
  delegation_completed: delegationRoute,

  // Daily tip → tip modal with content
  daily_tip: (data) => {
    const title =
      typeof data.title === 'string' ? encodeURIComponent(data.title) : ''
    const body =
      typeof data.body === 'string' ? encodeURIComponent(data.body) : ''
    return `/(app)/tip?title=${title}&body=${body}` as Href
  },

  // Engagement — inactivity → plants tab
  inactivity_nudge: () => '/(app)/(tabs)/plants' as Href,

  // Engagement — milestone → achievements
  plant_parent_milestone: () => '/(app)/achievements' as Href,

  // Gift — navigate to plants tab
  gift_subscription: () => '/(app)/(tabs)/plants' as Href,

  // Resubscribe nudge — navigate to upgrade screen
  resubscribe_nudge: () => '/(app)/subscription/upgrade' as Href,

  // Streaks — at risk → care tab (finish today's tasks), milestone →
  // achievements
  streak_at_risk: () => '/(app)/(tabs)/care' as Href,
  streak_milestone: () => '/(app)/achievements' as Href,

  // Weekly recap → home tab overview
  weekly_recap: () => '/(app)/(tabs)' as Href,

  // Subscription lifecycle — trial ending → subscription management,
  // approaching plant limit → upgrade screen
  trial_ending: () => '/(app)/subscription' as Href,
  approaching_limit: () => '/(app)/subscription/upgrade' as Href,

  // Anniversary — single plant → plant screen, otherwise plants tab
  // (not the care tab: an anniversary has no pending care task)
  plant_anniversary: plantOrPlantsTabRoute,
} as const satisfies Record<NotificationTopic, NotificationRouteResolver>

/**
 * Resolve the deep-link route for a notification based on its topic and data.
 * Returns null when no navigation should occur (e.g. unknown topic).
 */
export const resolveNotificationRoute = (
  data: Record<string, unknown>
): Href | null => {
  const topic = typeof data.topic === 'string' ? data.topic : null
  if (!topic) return null

  return pipe(
    Rec.get(TOPIC_ROUTES as Record<string, NotificationRouteResolver>, topic),
    Option.match({
      onNone: () => null,
      onSome: (resolve) => resolve(data),
    })
  )
}

// Whether the cold-start notification response has been consumed this JS
// session. setupNotificationListeners re-runs on auth-state changes; only
// the first call may route the launch tap, otherwise re-auth would
// re-navigate to an old destination.
let coldStartResponseHandled = false

// Identifiers of notification responses already routed. A tap can surface
// through both getLastNotificationResponseAsync and the response listener —
// dedupe so it never navigates twice.
const handledResponseIds = new Set<string>()

const routeNotificationResponse = (
  router: Router,
  response: Notifications.NotificationResponse
): void => {
  const id = response.notification.request.identifier
  if (handledResponseIds.has(id)) return

  const data = response.notification.request.content.data
  if (!data) return

  const route = resolveNotificationRoute(data as Record<string, unknown>)
  if (route) {
    handledResponseIds.add(id)
    router.push(route)
  }
}

/**
 * Set up notification interaction listeners
 * Returns a cleanup function to remove the listeners
 */
export function setupNotificationListeners(router: Router): () => void {
  // Cold start: a tap that launches the app from a killed state fires
  // before the listener below is registered, so it never receives the
  // response. expo-notifications replays it via
  // getLastNotificationResponseAsync — route it exactly once per launch.
  if (!coldStartResponseHandled) {
    coldStartResponseHandled = true
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        routeNotificationResponse(router, response)
      }
    })
  }

  // Handle notification tap when app is backgrounded/closed
  const responseSubscription =
    Notifications.addNotificationResponseReceivedListener((response) => {
      routeNotificationResponse(router, response)
    })

  // Handle notifications received while app is foregrounded
  const notificationSubscription =
    Notifications.addNotificationReceivedListener((notification) => {
      console.log('Notification received:', notification.request.content.title)
    })

  return () => {
    responseSubscription.remove()
    notificationSubscription.remove()
  }
}

/**
 * Get the device's IANA timezone (e.g., "America/New_York")
 * Returns 'UTC' if timezone cannot be determined
 */
export function getDeviceTimezone(): string {
  try {
    return pipe(
      Option.fromNullable(Intl.DateTimeFormat().resolvedOptions().timeZone),
      Option.filter(Str.isNonEmpty),
      Option.getOrElse(() => 'UTC')
    )
  } catch {
    return 'UTC'
  }
}

/**
 * Get the device's preferred language as a supported LanguageCode.
 * Falls back to 'en' if the device language is not supported.
 */
export const getDeviceLanguage = (): LanguageCode =>
  pipe(
    Arr.head(Localization.getLocales()),
    Option.flatMap((locale) => Option.fromNullable(locale.languageCode)),
    Option.match({
      onNone: () => 'en' as const,
      onSome: (code) =>
        pipe(
          Match.value(code),
          Match.when('fr', () => 'fr' as const),
          Match.when('en', () => 'en' as const),
          Match.orElse(() => 'en' as const)
        ),
    })
  )
