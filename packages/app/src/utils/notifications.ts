import { Match, pipe } from 'effect'
import * as Device from 'expo-device'
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
 * Set up notification interaction listeners
 * Returns a cleanup function to remove the listeners
 */
export function setupNotificationListeners(router: Router): () => void {
  // Handle notification tap when app is backgrounded/closed
  const responseSubscription =
    Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data

      // Navigate based on notification data
      if (data?.plantId && typeof data.plantId === 'string') {
        router.push(`/(app)/plants/${data.plantId}` as Href)
      } else if (data?.screen && typeof data.screen === 'string') {
        // Generic screen navigation - cast needed for dynamic paths
        router.push(data.screen as Href)
      }
    })

  // Handle notifications received while app is foregrounded
  const notificationSubscription =
    Notifications.addNotificationReceivedListener((notification) => {
      // Can add analytics or local state updates here
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
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    return timezone || 'UTC'
  } catch {
    return 'UTC'
  }
}
