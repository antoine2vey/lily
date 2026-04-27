import type { LanguageCode } from '@lily/shared'
import { Array as Arr, Match, Option, pipe, String as Str } from 'effect'
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
    const current = await requestPushToStartToken()
    if (current) void postStartToken(deviceTokenId, current)
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
 * Route to a delegation detail screen, or the delegations list as fallback.
 */
const delegationRoute = (data: Record<string, unknown>): Href => {
  const delegationId =
    typeof data.delegationId === 'string' ? data.delegationId : null
  return delegationId
    ? (`/(app)/delegation/${delegationId}` as Href)
    : ('/(app)/delegations' as Href)
}

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
    Match.value(topic),

    // Care reminders — single plant → plant screen, multiple → care tab
    Match.whenOr(
      'watering_reminder',
      'fertilization_reminder',
      'misting_reminder',
      'repotting_reminder',
      'overdue_reminder',
      'photo_reminder',
      () => plantRoute(data)
    ),

    // Social — new follower → profile of the person who followed
    Match.when('new_follower', () => {
      const senderId = typeof data.senderId === 'string' ? data.senderId : null
      return senderId ? (`/(app)/public-profile/${senderId}` as Href) : null
    }),

    // Social — nudge → care tab
    Match.when('nudge_to_water', () => '/(app)/(tabs)/care' as Href),

    // Delegation topics → delegation detail or list fallback
    Match.when('delegation_request', () => delegationRoute(data)),
    Match.when('delegation_accepted', () => delegationRoute(data)),
    Match.when('delegation_rejected', () => delegationRoute(data)),
    Match.when('delegation_canceled', () => delegationRoute(data)),
    Match.when('delegation_activated', () => delegationRoute(data)),
    Match.when('delegation_completed', () => delegationRoute(data)),

    // Daily tip → tip modal with content
    Match.when('daily_tip', () => {
      const title =
        typeof data.title === 'string' ? encodeURIComponent(data.title) : ''
      const body =
        typeof data.body === 'string' ? encodeURIComponent(data.body) : ''
      return `/(app)/tip?title=${title}&body=${body}` as Href
    }),

    // Engagement — inactivity → plants tab
    Match.when('inactivity_nudge', () => '/(app)/(tabs)/plants' as Href),

    // Engagement — milestone → achievements
    Match.when('plant_parent_milestone', () => '/(app)/achievements' as Href),

    // Gift — navigate to plants tab
    Match.when('gift_subscription', () => '/(app)/(tabs)/plants' as Href),

    // Resubscribe nudge — navigate to upgrade screen
    Match.when(
      'resubscribe_nudge',
      () => '/(app)/subscription/upgrade' as Href
    ),

    // Unknown topic — no navigation
    Match.orElse(() => null)
  )
}

/**
 * Set up notification interaction listeners
 * Returns a cleanup function to remove the listeners
 */
export function setupNotificationListeners(router: Router): () => void {
  // Handle notification tap when app is backgrounded/closed
  const responseSubscription =
    Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data
      if (!data) return

      const route = resolveNotificationRoute(data as Record<string, unknown>)
      if (route) {
        router.push(route)
      }
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
