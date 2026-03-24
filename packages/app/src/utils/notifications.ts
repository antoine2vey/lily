import type { LanguageCode } from '@lily/shared'
import { Array as Arr, Match, Option, pipe, String as Str } from 'effect'
import * as Device from 'expo-device'
import * as Localization from 'expo-localization'
import * as Notifications from 'expo-notifications'
import type { Href, Router } from 'expo-router'
import { Platform } from 'react-native'

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
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: process.env.EXPO_PUBLIC_PROJECT_ID,
    })
    return tokenData.data
  } catch (error) {
    console.error('Failed to get push token:', error)
    return null
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
    Match.when('watering_reminder', () => plantRoute(data)),
    Match.when('fertilization_reminder', () => plantRoute(data)),
    Match.when('misting_reminder', () => plantRoute(data)),
    Match.when('repotting_reminder', () => plantRoute(data)),
    Match.when('overdue_reminder', () => plantRoute(data)),
    Match.when('photo_reminder', () => plantRoute(data)),

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
 * Get the current badge count
 */
export async function getBadgeCount(): Promise<number> {
  return Notifications.getBadgeCountAsync()
}

/**
 * Set the badge count
 */
export async function setBadgeCount(count: number): Promise<void> {
  await Notifications.setBadgeCountAsync(count)
}

/**
 * Clear the badge count
 */
export async function clearBadgeCount(): Promise<void> {
  await Notifications.setBadgeCountAsync(0)
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
